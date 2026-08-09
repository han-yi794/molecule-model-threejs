const { chromium } = require('playwright-core');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const report = { consoleErrors: [], cases: [], ui: null };
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 200)); });

    await page.goto('http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);

    const cases = await page.evaluate(() => {
        function clear() { document.getElementById('btn-clear-molecule').click(); }
        function Hcount() { return window.__diag.atomPositions().filter(a => a.type === 'H').length; }
        const out = [];

        // 1) 丙烷骨架：3 C 线性，单键
        clear();
        const c1 = window.__createHeavyAtom('C', { x: 0, y: 0, z: 0 });
        const c2 = window.__createHeavyAtom('C', { x: 1.54, y: 0, z: 0 });
        const c3 = window.__createHeavyAtom('C', { x: 3.08, y: 0, z: 0 });
        window.__manualBond(c1, c2, 1); window.__manualBond(c2, c3, 1);
        const n1 = window.__addMissingHydrogens();
        out.push({ name: 'propaneSkeleton', expected: 8, got: n1, totalH: Hcount() });

        // 2) 乙烯骨架：C=C → 各缺 2；共 4
        clear();
        const e1 = window.__createHeavyAtom('C', { x: -0.67, y: 0, z: 0 });
        const e2 = window.__createHeavyAtom('C', { x: 0.67, y: 0, z: 0 });
        window.__manualBond(e1, e2, 2);
        const n2 = window.__addMissingHydrogens();
        out.push({ name: 'ethyleneSkeleton', expected: 4, got: n2, totalH: Hcount() });

        // 3) 乙炔骨架：C≡C，各补 1；共 2
        clear();
        const a1 = window.__createHeavyAtom('C', { x: -0.6, y: 0, z: 0 });
        const a2 = window.__createHeavyAtom('C', { x: 0.6, y: 0, z: 0 });
        window.__manualBond(a1, a2, 3);
        const n3 = window.__addMissingHydrogens();
        out.push({ name: 'acetyleneSkeleton', expected: 2, got: n3, totalH: Hcount() });

        // 4) 苯环骨架：6C 正六边形 1.5 键，各补 1；共 6
        clear();
        const cs = [];
        for (let i = 0; i < 6; i++) {
            const ang = i * Math.PI / 3;
            cs.push(window.__createHeavyAtom('C', { x: 1.4 * Math.cos(ang), y: 0, z: 1.4 * Math.sin(ang) }));
        }
        for (let i = 0; i < 6; i++) window.__manualBond(cs[i], cs[(i + 1) % 6], 1.5);
        const n4 = window.__addMissingHydrogens();
        out.push({ name: 'benzeneSkeleton', expected: 6, got: n4, totalH: Hcount() });

        // 5) 完整甲烷：补 0
        clear();
        window.__diag.generateSpec('methane');
        const m = window.__diag.atomPositions().filter(a => a.type === 'H').length;
        const n5 = window.__addMissingHydrogens();
        const m2 = window.__diag.atomPositions().filter(a => a.type === 'H').length;
        out.push({ name: 'methaneComplete', expected: 0, got: n5, hBefore: m, hAfter: m2 });

        // 6) 完整苯(生成器带 H)：补 0
        clear();
        window.__diag.generateSpec('benzene');
        const b1 = window.__diag.atomPositions().filter(a => a.type === 'H').length;
        const n6 = window.__addMissingHydrogens();
        out.push({ name: 'benzeneComplete', expected: 0, got: n6, hBefore: b1 });

        // 7) 醇羟基：C-O-H 骨架 C-O（O 单键）→ O 补 1，C 补 3；甲醇
        clear();
        const mc = window.__createHeavyAtom('C', { x: 0, y: 0, z: 0 });
        const mo = window.__createHeavyAtom('O', { x: 1.43, y: 0, z: 0 });
        window.__manualBond(mc, mo, 1);
        const n7 = window.__addMissingHydrogens();
        out.push({ name: 'methanolSkeleton', expected: 4, got: n7, totalH: Hcount() });

        // 8) 胺：C-N 骨架 → C 补3 + N 补2 = 5
        clear();
        const nc = window.__createHeavyAtom('C', { x: 0, y: 0, z: 0 });
        const nn = window.__createHeavyAtom('N', { x: 1.48, y: 0, z: 0 });
        window.__manualBond(nc, nn, 1);
        const n8 = window.__addMissingHydrogens();
        out.push({ name: 'methylamineSkeleton', expected: 5, got: n8 });

        return out;
    });
    report.cases = cases;

    // 补氢后优化：验证键长/键角收敛（用苯骨架案例跑）
    const opt = await page.evaluate(() => {
        document.getElementById('btn-clear-molecule').click();
        const cs = [];
        for (let i = 0; i < 6; i++) cs.push(window.__createHeavyAtom('C', { x: 1.4 * Math.cos(i * Math.PI / 3), y: 0, z: 1.4 * Math.sin(i * Math.PI / 3) }));
        for (let i = 0; i < 6; i++) window.__manualBond(cs[i], cs[(i + 1) % 6], 1.5);
        window.__addMissingHydrogens();
        window.__diag.runOpt();
        const lens = window.__diag.bonds().map(b => ({ t: b.type, len: b.len }));
        const cStd = window.__diag.angleStds();
        return { cStd, chMin: Math.min(...lens.filter(l => l.t === 1).map(l => +Number(l.len).toFixed(3))) >= 1.0, hCount: window.__diag.atomPositions().filter(a => a.type === 'H').length };
    });
    report.opt = opt;

    // UI: 按钮切换 + 全局优化钩子
    report.ui = await page.evaluate(async () => {
        const b = document.getElementById('btn-toggle-hydro');
        const before = b.textContent;
        b.click();
        const afterOn = b.textContent;
        const autoOn = window.__hydrogenateAuto();
        window.__setHydrogenate(false);
        const afterOff = b.textContent;
        window.__setHydrogenate(false);
        return { before, afterOn, autoOn, afterOff };
    });

    // 33 几何 + 23 pi 回归（不触发补氢路径，需确认无回归）
    await page.waitForTimeout(300);
    const reg = await page.evaluate(async () => {
        const out = {};
        try {
            const res = await window.runAllExamplesAndTests();
            const lr = window.lastRunResults;
            out.geom = { total: lr.results.length, passed: lr.results.filter(r => r && r.pass).length, fails: lr.results.filter(r => r && !r.pass).map(r => r.example) };
        } catch (e) { out.geom = { error: String(e).slice(0, 300) }; }
        try { await window.__runPiSystemTests(); } catch (e) {}
        try {
            const pr = JSON.parse(localStorage.getItem('PI_TEST_REPORT') || '{}');
            out.pi = { total: pr.summary ? pr.summary.length : null, passed: pr.summary ? pr.summary.filter(s => s.pass).length : null, fails: pr.summary ? pr.summary.filter(s => !s.pass).map(s => s.key) : [] };
        } catch (e) { out.pi = { error: String(e).slice(0, 300) }; }
        return out;
    });
    report.reg = reg;

    await browser.close();
    console.log(JSON.stringify(report, null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });