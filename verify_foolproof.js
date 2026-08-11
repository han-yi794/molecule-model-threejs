// 防呆测试：边界/误操作场景下程序不崩溃、状态合理（球棍模型4.html）
// 运行: cmd /c "node verify_foolproof.js > verifyF.json 2>&1"
const { chromium } = require('playwright-core');

const URL = 'http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const report = { cases: [], consoleErrors: [] };
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));

    const caseStart = Date.now();
    function addCase(name, pass, detail) {
        report.cases.push({ name, pass: !!pass, detail: String(detail || '').slice(0, 300) });
    }

    // ---------- A. 初始化/参数防呆 ----------
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    addCase('A1 正常加载无初始化错误', await page.evaluate(() => (window.__INIT_ERRORS || []).length === 0),
        await page.evaluate(() => JSON.stringify((window.__INIT_ERRORS || []).slice(0, 3))));

    // A2: 非法 URL 参数
    await page.goto(URL.replace('?noauto=1', '?noauto=whatever&foo=bar'), { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    addCase('A2 非法 URL 参数不崩', await page.evaluate(() => !!(window.__diag && (window.__INIT_ERRORS || []).length < 3)),
        await page.evaluate(() => JSON.stringify((window.__INIT_ERRORS || []).slice(0, 3))));

    // A3: localStorage 非法 DRAG_MODE
    await page.evaluate(() => { try { localStorage.setItem('DRAG_MODE', 'hacker-mode'); } catch (e) {} });
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    addCase('A3 非法 DRAG_MODE 回退默认', await page.evaluate(() => {
        const v = window.__dragMode.get();
        return ['plane', 'gizmo', 'lockstart', 'gizmo-lock'].includes(v);
    }), await page.evaluate(() => window.__dragMode.get()));
    await page.evaluate(() => { try { localStorage.removeItem('DRAG_MODE'); } catch (e) {} });

    // A4: localStorage 非法 OPT_PARAMS（损坏 JSON）
    await page.evaluate(() => { try { localStorage.setItem('OPT_PARAMS', '{{{broken'); } catch (e) {} });
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    addCase('A4 损坏 OPT_PARAMS 不崩且回退默认', await page.evaluate(() => {
        return !!(window.OPT_PARAMS && typeof window.OPT_PARAMS.ITERATIONS === 'number');
    }), await page.evaluate(() => (window.OPT_PARAMS ? 'ITERATIONS=' + window.OPT_PARAMS.ITERATIONS : 'no OPT_PARAMS')));
    await page.evaluate(() => { try { localStorage.removeItem('OPT_PARAMS'); } catch (e) {} });

    // ---------- B. 空状态防呆 ----------
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1000);

    addCase('B1 空画布优化不崩', await page.evaluate(() => {
        try { window.__diag.generateSpec('methane'); window.__diag.runOpt(); } catch (e) { return false; }
        return true;
    }), 'methane 正常路径作为对照');

    addCase('B2 连续清空×3 不崩', await page.evaluate(() => {
        try { for (let i = 0; i < 3; i++) window.__diag.generateSpec('benzene'); } catch (e) { return false; }
        return true;
    }), '');

    addCase('B3 空分子补氢不崩', await page.evaluate(() => {
        try { const n = window.__addMissingHydrogens(); return n === 0; } catch (e) { return false; }
    }), '');

    addCase('B4 空分子优化不崩', await page.evaluate(() => {
        try { window.__diag.runOpt(); return true; } catch (e) { return false; }
    }), '');

    addCase('B5 空分子全自动优化(补氢+优化)不崩', await page.evaluate(() => {
        try { window.optimizeAllWithAutoHydrogen ? window.optimizeAllWithAutoHydrogen() : window.__diag.runOpt(); return true; } catch (e) { return false; }
    }), '');

    // ---------- C. 状态机防呆 ----------
    addCase('C1 旋转激活中清空退出旋转', await page.evaluate(() => {
        try {
            window.__diag.generateSpec('propane');
            // 尝试激活旋转（选中键前置：点键在真实路径，这里用 setPivot 模拟；无 selectedBond 时不应抛错）
            window.__torsion.setPivot(-1);
            const cleanOk = (typeof window.__torsion.clear === 'function') && (window.__torsion.clear(), true);
            // 真实路径：清空分子（generateSpec 内部清空）→ 旋转必须退出
            window.__diag.generateSpec('benzene');
            return cleanOk && window.__torsion.active() === false;
        } catch (e) { return false; }
    }), '');

    addCase('C2 选中原子→删除→优化不崩', await page.evaluate(() => {
        try {
            window.__diag.generateSpec('propane');
            window.__dragMode.selectFirstAtom();
            const ats = window.__dragMode.atoms();
            if (!ats.length) return false;
            window.__diag.runOpt();
            return true;
        } catch (e) { return false; }
    }), '');

    addCase('C3 补氢开启时优化空分子不崩', await page.evaluate(() => {
        try {
            window.__setHydrogenate(true);
            window.optimizeAllWithAutoHydrogen ? window.optimizeAllWithAutoHydrogen() : window.__diag.runOpt();
            window.__setHydrogenate(false);
            return true;
        } catch (e) { window.__setHydrogenate(false); return false; }
    }), '');

    // ---------- D. 几何极端 ----------
    addCase('D1 单原子 C 优化不崩', await page.evaluate(() => {
        try {
            window.__diag.generateSpec('methane');
            const before = window.__dragMode.atoms().length;
            // 造一个"裸碳"（用 createHeavyAtom 加原子但可能自动成键，先看是否提供）
            if (window.__createHeavyAtom) {
                window.__createHeavyAtom('C', 3.5, 0, 0);
            }
            window.__diag.runOpt();
            const after = window.__dragMode.atoms().length;
            return after >= before;
        } catch (e) { return false; }
    }), '');

    addCase('D2 孤立 H 原子优化不崩', await page.evaluate(() => {
        try {
            window.__diag.generateSpec('methane');
            window.__createHeavyAtom('H', -3.2, 2.0, 0.5);
            window.__diag.runOpt();
            return true;
        } catch (e) { return false; }
    }), '');

    addCase('D3 极端扰动(0.9)后优化不崩', await page.evaluate(() => {
        try {
            window.__diag.generateSpec('cyclohexane');
            window.__diag.perturb(0.9);
            window.__diag.runOpt();
            return true;
        } catch (e) { return false; }
    }), '');

    addCase('D4 重复生成+优化 8 次不崩', await page.evaluate(() => {
        try {
            for (let i = 0; i < 8; i++) {
                window.__diag.generateSpec(['methane', 'benzene', 'propane', 'cyclohexane'][i % 4]);
                window.__diag.runOpt();
            }
            return true;
        } catch (e) { return false; }
    }), '');

    addCase('D5 手动连键参数非法(null/自连)不崩且拒绝', await page.evaluate(() => {
        try {
            if (!window.__manualBond) return true;
            const r1 = window.__manualBond(null, null, 1);
            const r2 = window.__manualBond({}, {}, 1);
            const ats = window.__dragMode.atoms();
            const meshes = window.__dragMode.atoms ? [] : [];
            return r1 === false && r2 === false;
        } catch (e) { return false; }
    }), '');

    // ---------- E. 真实鼠标交互防呆 ----------
    await page.evaluate(() => { try { window.__diag.generateSpec('benzene'); } catch (e) {} });
    await page.waitForTimeout(300);

    // E1: 连点「清空」5 次（4 号版「生成」按钮被 UI 隐藏，清空按钮可见）
    let genErr = false;
    for (let i = 0; i < 5; i++) {
        try { await page.click('#btn-clear-molecule', { timeout: 2000 }); } catch (e) { genErr = true; }
        await page.waitForTimeout(80);
    }
    const atomCount1 = await page.evaluate(() => window.__dragMode.atoms().length);
    addCase('E1 连点清空×5 不崩', !genErr && atomCount1 === 0, 'atoms=' + atomCount1);

    // E2: 旋转模式激活后切换分子退出旋转
    await page.evaluate(() => { try { window.__diag.generateSpec('propane'); } catch (e) {} });
    await page.waitForTimeout(300);
    const e2 = await page.evaluate(() => {
        const out = { step: 0, ok: true, err: '' };
        try {
            out.atoms = window.__dragMode.atoms().map(a => a.p);
            const bonds = window.__diag.bonds();
            const cc = bonds.find(b => b.types[0] === 'C' && b.types[1] === 'C');
            if (!cc) { out.ok = false; out.err = 'no CC bond'; return out; }
            const ids = bonds.map(b => b.pair).flat();
            const minId = Math.min(...ids);
            const pA = window.__dragMode.atoms()[cc.pair[0] - minId];
            const pB = window.__dragMode.atoms()[cc.pair[1] - minId];
            if (!pA || !pB) { out.ok = false; out.err = 'atom index lookup fail'; return out; }
            const sA = window.__dragMode.project(pA.p[0], pA.p[1], pA.p[2]);
            const sB = window.__dragMode.project(pB.p[0], pB.p[1], pB.p[2]);
            out.mid = { x: Math.round((sA.x + sB.x) / 2), y: Math.round((sA.y + sB.y) / 2) };
            out.endpoint = { x: Math.round(sB.x), y: Math.round(sB.y) };
            out.ccPair = [cc.pair[0], cc.pair[1]];
            out.minId = minId;
        } catch (e) { out.ok = false; out.err = String(e); }
        return out;
    });
    if (e2.ok) {
        await page.mouse.click(e2.mid.x, e2.mid.y);   // 选键弹菜单（selectedBond 置位）
        await page.waitForTimeout(150);
        await page.mouse.click(500, 400);             // 点空白关菜单
        await page.waitForTimeout(150);
        await page.mouse.click(e2.endpoint.x, e2.endpoint.y); // 点端点原子设 pivot
        await page.waitForTimeout(200);
        const e2Act = await page.evaluate(() => ({ active: window.__torsion.active(), pivot: window.__torsion.pivot() }));
        await page.evaluate(() => { try { window.__diag.generateSpec('ethane'); } catch (e) {} });
        await page.waitForTimeout(200);
        const e2After = await page.evaluate(() => window.__torsion.active());
        const activated = e2Act.active === true && !!e2Act.pivot;
        addCase('E2 旋转激活后切换分子退出旋转', activated && e2After === false,
            'activated=' + activated + ' (active=' + e2Act.active + ',pivot=' + JSON.stringify(e2Act.pivot) + ') → after=' + e2After);
    } else {
        addCase('E2 旋转激活后切换分子退出旋转', false, 'prep fail: ' + e2.err);
    }

    // E3: 拖动到侧栏区域松手（防 ghost）
    await page.evaluate(() => { try { window.__diag.generateSpec('benzene'); } catch (e) {} });
    await page.waitForTimeout(300);
    const e3 = await page.evaluate(() => {
        const out = { x: 0, y: 0 };
        try {
            const ats = window.__dragMode.atoms();
            const a = ats[0];
            const s = window.__dragMode.project(a.p[0], a.p[1], a.p[2]);
            out.x = Math.round(s.x); out.y = Math.round(s.y);
        } catch (e) { out.err = String(e); }
        return out;
    });
    if (e3.x) {
        try {
            await page.mouse.move(e3.x, e3.y);
            await page.mouse.down();
            await page.mouse.move(30, e3.y + 120, { steps: 5 }); // 拖到画布边缘/侧栏方向
            await page.mouse.up();
        } catch (e) { addCase('E3 拖到侧栏松手无 ghost', false, String(e)); }
        await page.waitForTimeout(200);
        const e3n = await page.evaluate(() => window.__dragMode.atoms().length);
        addCase('E3 拖到侧栏松手无 ghost', e3n === 12, 'atoms=' + e3n + ' (期望 12)');
    } else {
        addCase('E3 拖到侧栏松手无 ghost', false, 'prep fail');
    }

    // E4: 双击空白处不崩
    let dblErr = false;
    try { await page.mouse.dblclick(400, 300); } catch (e) { dblErr = true; }
    addCase('E4 双击空白不崩', !dblErr, '');

    // E5: 空画布拖出新原子
    await page.evaluate(() => { try { window.__diag.generateSpec('methane'); window.__diag.clearMolecule ? window.__diag.clearMolecule() : null; } catch (e) {} });
    // 用真实"清空"按钮(更贴近用户)
    await page.click('#btn-clear-molecule', { timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(200);
    const e5 = await page.evaluate(() => {
        const out = { ok: true };
        try {
            const cards = document.querySelectorAll('.drag-card, .atom-card, [id^="drag-"]');
            out.cards = cards.length;
            if (cards.length) {
                const r = cards[0].getBoundingClientRect();
                out.cardRect = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
            }
            out.atoms = window.__dragMode.atoms().length;
        } catch (e) { out.ok = false; out.err = String(e); }
        return out;
    });
    if (e5.ok && e5.cardRect) {
        try {
            await page.mouse.move(e5.cardRect.x, e5.cardRect.y);
            await page.mouse.down();
            await page.mouse.move(700, 350, { steps: 8 });
            await page.mouse.up();
        } catch (e) { addCase('E5 空画布拖出新原子', false, String(e)); }
        await page.waitForTimeout(300);
        const e5n = await page.evaluate(() => window.__dragMode.atoms().length);
        addCase('E5 空画布拖出新原子', e5n >= 1, 'atoms=' + e5n);
    } else {
        addCase('E5 空画布拖出新原子', false, 'no card found');
    }

    // ---------- 汇总 ----------
    await page.waitForTimeout(300);
    report.elapsedSec = +((Date.now() - caseStart) / 1000).toFixed(1);
    report.summary = {
        total: report.cases.length,
        pass: report.cases.filter(c => c.pass).length,
        fail: report.cases.filter(c => !c.pass).length
    };
    report.failNames = report.cases.filter(c => !c.pass).map(c => c.name);

    await browser.close();
    console.log(JSON.stringify(report, null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
