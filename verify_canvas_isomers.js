// 验证：从画布分子反推完整分子式（含隐式氢）并查找同分异构体（球棍模型4.html）
// 运行: cmd /c "node verify_canvas_isomers.js > verify_canvas_isomers.log 2>&1"
//
// 覆盖：
//   A1 接口 / 按钮 / shuffle 图标 / 上限常量就绪
//   A2 空画布：返回 false + 提示，不弹面板
//   B  隐式氢口径（C–C / 苯环 1.5 键 / C–C–O / 显式氢乙烷）
//   C  状态条口径不变（仍只数显式原子，C2 vs C2H6）
//   D  真实点击乙醇骨架 → C₂H₆O 结果面板 + 来源说明条
//   E  显式氢乙烷 → 说明条「画布已含全部氢」
//   F  两个独立片段 → 合计分子式 C4H12 / fragments=2
//   G  51 重原子 → 上限提示、不发 PubChem 请求
//   H  20 碳链 C20H42 → 检索前筛选面板（候选 > 400，带来源说明）
//   I  分子锁定时仍可检索（只读操作不被锁拦截）
//   J  375×667 手机端按钮可见、纯图标、无横向溢出
//   K  33 例几何自测全过
//   L  零 console / pageerror
const { chromium } = require('playwright-core');

const URL = 'http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=canvas_isomers1';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const results = [];
    const errs = [];
    const net = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    page.on('request', r => { if (/pubchem\.ncbi\.nlm\.nih\.gov/i.test(r.url())) net.push(r.url()); });

    const ok = (name, cond, extra) => {
        const line = (cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '');
        results.push(line);
        console.log(line);
    };
    const visible = (sel) => page.evaluate(s => {
        const el = document.querySelector(s);
        if (!el) return false;
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden';
    }, sel);
    const idle = async () => {
        try { await page.waitForFunction(() => window.__ddAnim && window.__ddAnim.idle(), null, { timeout: 8000 }); } catch (e) {}
    };
    const clearToast = () => page.evaluate(() => { const t = document.getElementById('toast-message'); if (t) t.textContent = ''; });

    // 建分子：atoms = [[元素, x, y, z], ...]，bonds = [[i, j, 键级?], ...]
    async function build(atoms, bonds) {
        return page.evaluate(({ atoms, bonds }) => {
            window.__canvasIsomers.clear();
            const made = atoms.map(a => window.__createHeavyAtom(a[0], { x: a[1], y: a[2], z: a[3] }));
            bonds.forEach(b => window.__manualBond(made[b[0]], made[b[1]], b[2] || 1));
            return { atoms: made.length, bonds: window.__statusBar().bonds };
        }, { atoms, bonds });
    }
    function chain(n, el) {
        const atoms = [], bonds = [];
        for (let i = 0; i < n; i++) atoms.push([el || 'C', +(i * 1.54).toFixed(3), 0, 0]);
        for (let i = 0; i < n - 1; i++) bonds.push([i, i + 1, 1]);
        return { atoms, bonds };
    }
    function benzeneRing() {
        const atoms = [], bonds = [];
        for (let i = 0; i < 6; i++) {
            const a = i * Math.PI / 3;
            atoms.push(['C', +(1.4 * Math.cos(a)).toFixed(4), +(1.4 * Math.sin(a)).toFixed(4), 0]);
        }
        for (let i = 0; i < 6; i++) bonds.push([i, (i + 1) % 6, 1.5]);
        return { atoms, bonds };
    }
    async function waitPanelRows(minRows, timeout) {
        try {
            await page.waitForFunction((n) => {
                const p = document.getElementById('isomer-panel');
                if (!p || getComputedStyle(p).display === 'none') return false;
                return document.querySelectorAll('#isomer-list label').length >= n;
            }, minRows, { timeout: timeout || 90000 });
            return true;
        } catch (e) { return false; }
    }

    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__diag && window.__canvasIsomers && window.__statusBar && window.__ddAnim), null, { timeout: 60000 });
    // webdriver 环境生成抽屉默认展开，会盖住顶栏右侧按钮
    await page.evaluate(() => window.__setInputPanelOpen(false));
    await idle();

    // ---------------- A1 接口就绪 ----------------
    const a1 = await page.evaluate(() => {
        const btn = document.getElementById('btn-canvas-isomers');
        return {
            find: typeof window.__findIsomersFromCanvas,
            api: typeof window.__canvasIsomers,
            formulaFn: typeof window.__molecularFormulaWithImplicitH,
            btn: !!btn,
            icon: !!document.querySelector('#btn-canvas-isomers svg[data-icon="shuffle"]'),
            label: (btn && btn.querySelector('.tb-label') ? btn.querySelector('.tb-label').textContent : ''),
            maxHeavy: window.__canvasIsomers.maxHeavy(),
            title: (btn && btn.title) || ''
        };
    });
    ok('A1 接口 / 按钮 / shuffle 图标 / 上限 50 就绪',
        a1.find === 'function' && a1.api === 'object' && a1.formulaFn === 'function'
        && a1.btn && a1.icon && a1.label === '异构体' && a1.maxHeavy === 50 && a1.title.includes('同分异构体'), a1);

    // ---------------- A2 空画布 ----------------
    await page.evaluate(() => window.__canvasIsomers.clear());
    await clearToast();
    const a2 = await page.evaluate(async () => {
        const r = await window.__findIsomersFromCanvas();
        return { r, toast: document.getElementById('toast-message').textContent };
    });
    const a2panel = await visible('#isomer-panel');
    ok('A2 空画布返回 false + 提示，不弹面板',
        a2.r === false && a2.toast.includes('画布上还没有分子') && !a2panel, Object.assign({}, a2, { panel: a2panel }));

    // ---------------- B1 C–C → C2H6 ----------------
    const cc = chain(2);
    await build(cc.atoms, cc.bonds);
    const b1 = await page.evaluate(() => window.__canvasIsomers.formula());
    ok('B1 C–C 补 6 个隐式氢 → C2H6',
        b1.formula === 'C2H6' && b1.implicitH === 6 && b1.heavy === 2 && b1.fragments === 1, b1);

    // ---------------- B2 苯环 → C6H6 ----------------
    const bz = benzeneRing();
    await build(bz.atoms, bz.bonds);
    const b2 = await page.evaluate(() => window.__canvasIsomers.formula());
    ok('B2 苯环（1.5 键）→ C6H6',
        b2.formula === 'C6H6' && b2.implicitH === 6 && b2.heavy === 6, b2);

    // ---------------- B3 C–C–O → C2H6O ----------------
    await build([['C', 0, 0, 0], ['C', 1.54, 0, 0], ['O', 2.97, 0, 0]], [[0, 1, 1], [1, 2, 1]]);
    const b3 = await page.evaluate(() => window.__canvasIsomers.formula());
    ok('B3 C–C–O → C2H6O',
        b3.formula === 'C2H6O' && b3.implicitH === 6 && b3.heavy === 3, b3);

    // ---------------- B4 显式氢乙烷 → implicitH 0 ----------------
    await page.evaluate(() => window.__diag.generate('ethane'));
    const b4 = await page.evaluate(() => window.__canvasIsomers.formula());
    ok('B4 显式氢乙烷 → C2H6 且隐式氢 0',
        b4.formula === 'C2H6' && b4.implicitH === 0 && b4.atoms === 8 && b4.heavy === 2, b4);

    // ---------------- C 状态条口径不变 ----------------
    await build(cc.atoms, cc.bonds);
    const c1 = await page.evaluate(() => ({ bar: window.__statusBar().formula, full: window.__canvasIsomers.formula().formula }));
    ok('C 状态条仍只数显式原子（C2），新函数为 C2H6',
        c1.bar === 'C2' && c1.full === 'C2H6', c1);

    // ---------------- D 真实点击乙醇骨架 → 结果面板 ----------------
    await build([['C', 0, 0, 0], ['C', 1.54, 0, 0], ['O', 2.97, 0, 0]], [[0, 1, 1], [1, 2, 1]]);
    await clearToast();
    await page.click('#btn-canvas-isomers');
    const dShown = await waitPanelRows(2);
    const d = await page.evaluate(() => {
        const title = document.getElementById('isomer-panel-title').textContent;
        const noteEl = document.getElementById('isomer-presearch-note');
        const note = document.getElementById('isomer-presearch-note-text').textContent;
        const rows = Array.from(document.querySelectorAll('#isomer-list label')).map(l => l.textContent);
        return {
            title, note,
            noteVisible: !!noteEl && getComputedStyle(noteEl).display !== 'none',
            rows: rows.length,
            hasEthanol: rows.some(t => /ethanol/i.test(t))
        };
    });
    ok('D 点击乙醇骨架 → C₂H₆O 结果面板 + 来源说明条',
        dShown && d.title.includes('C₂H₆O') && d.rows >= 2 && d.hasEthanol && d.noteVisible
        && d.note.includes('画布分子') && d.note.includes('含 6 个隐式氢') && d.note.includes('结果可能包含当前结构'), d);
    await page.click('#isomer-panel-close');
    await idle();

    // ---------------- E 显式氢乙烷 → 画布已含全部氢 ----------------
    await page.evaluate(() => window.__diag.generate('ethane'));
    await clearToast();
    await page.click('#btn-canvas-isomers');
    // C2H6 在 PubChem 只有乙烷 1 条（去重后 1 行）
    const eShown = await waitPanelRows(1);
    const e = await page.evaluate(() => ({
        title: document.getElementById('isomer-panel-title').textContent,
        note: document.getElementById('isomer-presearch-note-text').textContent,
        rows: document.querySelectorAll('#isomer-list label').length
    }));
    ok('E 显式氢乙烷 → 说明条「画布已含全部氢」',
        eShown && e.rows >= 1 && e.title.includes('C₂H₆') && e.note.includes('画布已含全部氢'), e);
    await page.click('#isomer-panel-close');
    await idle();

    // ---------------- F 两个独立片段 ----------------
    await build([['C', 0, 0, 0], ['C', 1.54, 0, 0], ['C', 10, 0, 0], ['C', 11.54, 0, 0]], [[0, 1, 1], [2, 3, 1]]);
    const f = await page.evaluate(() => window.__canvasIsomers.formula());
    ok('F 两个独立片段 → C4H12 / fragments 2',
        f.formula === 'C4H12' && f.fragments === 2 && f.implicitH === 12 && f.heavy === 4, f);

    // ---------------- G 51 重原子 → 上限、不发请求 ----------------
    const big = chain(51);
    await build(big.atoms, big.bonds);
    const gBefore = net.length;
    await clearToast();
    const g = await page.evaluate(async () => {
        const r = await window.__findIsomersFromCanvas();
        return { r, toast: document.getElementById('toast-message').textContent, heavy: window.__canvasIsomers.formula().heavy };
    });
    await page.waitForTimeout(400);
    ok('G 51 重原子 → 上限提示且不发 PubChem 请求',
        g.r === false && g.heavy === 51 && g.toast.includes('上限（50 个）') && net.length === gBefore,
        Object.assign({}, g, { net: net.length - gBefore }));

    // ---------------- H 20 碳链 → 检索前筛选 ----------------
    const eic = chain(20);
    await build(eic.atoms, eic.bonds);
    const hFormula = await page.evaluate(() => window.__canvasIsomers.formula());
    await clearToast();
    await page.click('#btn-canvas-isomers');
    let hShown = true;
    try {
        await page.waitForFunction(() => {
            const p = document.getElementById('isomer-pre-panel');
            return !!p && getComputedStyle(p).display !== 'none';
        }, null, { timeout: 60000 });
    } catch (err) { hShown = false; }
    const h = await page.evaluate(() => ({
        title: document.getElementById('isomer-pre-title').textContent,
        hint: document.getElementById('isomer-pre-hint').textContent,
        toast: document.getElementById('toast-message').textContent
    }));
    ok('H C20H42 → 检索前筛选面板（来源说明 + 阈值 400）',
        hShown && hFormula.formula === 'C20H42' && hFormula.implicitH === 42
        && h.title.includes('检索前筛选') && h.title.includes('C₂₀H₄₂')
        && h.hint.includes('画布分子') && h.hint.includes('C₂₀H₄₂') && h.hint.includes('400'),
        Object.assign({ formula: hFormula }, h));
    await page.click('#isomer-pre-close');
    await idle();

    // ---------------- I 分子锁定时仍可检索 ----------------
    await build([['C', 0, 0, 0], ['C', 1.54, 0, 0], ['O', 2.97, 0, 0]], [[0, 1, 1], [1, 2, 1]]);
    await page.evaluate(() => window.__moleculeLock.set(true));
    await clearToast();
    await page.click('#btn-canvas-isomers');
    const iShown = await waitPanelRows(2);
    const i = await page.evaluate(() => ({
        locked: window.__moleculeLock.get(),
        title: document.getElementById('isomer-panel-title').textContent
    }));
    ok('I 分子锁定时仍可检索（只读）',
        i.locked === true && iShown && i.title.includes('C₂H₆O'), Object.assign({ shown: iShown }, i));
    await page.evaluate(() => window.__moleculeLock.set(false));
    await page.click('#isomer-panel-close');
    await idle();

    // ---------------- J 375×667 手机端 ----------------
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    const j = await page.evaluate(() => {
        const btn = document.getElementById('btn-canvas-isomers');
        const r = btn.getBoundingClientRect();
        const lbl = btn.querySelector('.tb-label');
        return {
            visible: r.width > 0 && r.height > 0,
            rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
            inView: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= 46,
            labelHidden: !!lbl && getComputedStyle(lbl).display === 'none',
            scrollW: document.documentElement.scrollWidth,
            innerW: innerWidth
        };
    });
    ok('J 375×667 按钮可见、纯图标、无横向溢出',
        j.visible && j.inView && j.labelHidden && j.scrollW <= j.innerW + 1, j);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);

    // ---------------- K 33 例几何自测 ----------------
    await page.evaluate(() => { window.lastRunResults = null; window.runAllExamplesAndTests(); });
    let kDone = true;
    try {
        await page.waitForFunction(() => window.lastRunResults && window.lastRunResults.results && window.lastRunResults.results.length === 33, null, { timeout: 300000 });
    } catch (err) { kDone = false; }
    const k = await page.evaluate(() => {
        const r = window.lastRunResults;
        if (!r || !r.results) return { total: 0, passed: 0, fails: ['no results'] };
        return { total: r.results.length, passed: r.results.filter(x => x.pass).length, fails: r.results.filter(x => !x.pass).map(x => x.example) };
    });
    ok('K 33 例几何自测全过', kDone && k.total === 33 && k.passed === 33, k);

    // ---------------- L 零 console / pageerror ----------------
    ok('L 零 console / pageerror', errs.length === 0, errs.slice(0, 5));

    console.log('\n==== SUMMARY ====');
    console.log('PASS ' + results.filter(r => r.startsWith('PASS')).length + ' / ' + results.length);
    results.filter(r => r.startsWith('FAIL')).forEach(r => console.log(r));

    await browser.close();
    process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})().catch(e => {
    console.error('FATAL', e && e.stack || e);
    process.exit(2);
});
