// 验证：顶栏「补氢」独立按钮（球棍模型4.html）
// 运行: cmd /c "node verify_hydrogenate_button.js > verify_hydrogenate_button.log 2>&1"
// 前置: 仓库根目录已起 python -m http.server 8000
//
// 覆盖：
//   H1 按钮 / atom 图标 / 独立接口 __hydrogenateNow 就绪
//   H2 空画布：提示「画布上还没有分子」，不产生原子
//   H3 丙烷骨架 → 一键补 8 H（C3H8），且不依赖「自动补氢」开关
//   H4 再点一次：提示「没有需要补的氢」，原子数/历史不增加
//   H5 撤销恢复：撤销回到骨架、恢复带回全部 H
//   H6 苯环骨架（1.5 键）→ 补 6 H（C6H6），芳香环保持
//   H7 结构锁：点击被拦截、不补氢
//   H8 375×667：按钮可见（纯图标）、无横向溢出、真实点击可用
//   H9 33 例几何自测全过
//   H10 零 console / pageerror
const { chromium } = require('playwright-core');

const URL = 'http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=hydrogenate1';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const results = [];
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

    const ok = (name, cond, extra) => {
        const line = (cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '');
        results.push(line);
        console.log(line);
    };
    const clearToast = () => page.evaluate(() => { const t = document.getElementById('toast-message'); if (t) t.textContent = ''; });
    const toast = () => page.evaluate(() => (document.getElementById('toast-message') || {}).textContent || '');
    const counts = () => page.evaluate(() => {
        const pos = window.__diag.atomPositions();
        return { atoms: pos.length, h: pos.filter(a => a.type === 'H').length };
    });

    // 建骨架：atoms = [[元素, x, y, z], ...]，bonds = [[i, j, 键级?], ...]
    async function build(atoms, bonds) {
        return page.evaluate(({ atoms, bonds }) => {
            document.getElementById('btn-clear-molecule').click();
            const made = atoms.map(a => window.__createHeavyAtom(a[0], { x: a[1], y: a[2], z: a[3] }));
            bonds.forEach(b => window.__manualBond(made[b[0]], made[b[1]], b[2] || 1));
            window.__history.reset();     // 以骨架为撤销基线
            return { atoms: made.length, bonds: window.__statusBar().bonds };
        }, { atoms, bonds });
    }
    function chain(n) {
        const atoms = [], bonds = [];
        for (let i = 0; i < n; i++) atoms.push(['C', +(i * 1.54).toFixed(3), 0, 0]);
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
    async function clickHydro(waitAtoms) {
        await page.click('#btn-hydrogenate');
        if (waitAtoms) {
            try {
                await page.waitForFunction((n) => window.__diag.atomPositions().length >= n, waitAtoms, { timeout: 6000 });
            } catch (e) { /* 由后续断言兜底 */ }
        }
        await page.waitForTimeout(350);
    }

    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__diag && window.__statusBar && window.__moleculeLock && window.__history), null, { timeout: 60000 });
    await page.evaluate(() => window.__setInputPanelOpen(false));
    await page.waitForTimeout(400);

    // ---------------- H1 按钮 / 接口 ----------------
    const h1 = await page.evaluate(() => {
        const btn = document.getElementById('btn-hydrogenate');
        const rect = btn ? btn.getBoundingClientRect() : null;
        return {
            exists: !!btn,
            inTopbar: !!(btn && btn.closest('#topbar')),
            h: rect ? Math.round(rect.height) : 0,
            icon: !!document.querySelector('#btn-hydrogenate svg[data-icon="atom"]'),
            label: btn && btn.querySelector('.tb-label') ? btn.querySelector('.tb-label').textContent : '',
            title: btn ? btn.title : '',
            api: typeof window.__hydrogenateNow
        };
    });
    ok('H1 顶栏「补氢」按钮 + atom 图标 + __hydrogenateNow 就绪',
        h1.exists && h1.inTopbar && h1.h === 32 && h1.icon && h1.label === '补氢'
        && h1.title.includes('补氢') && h1.api === 'function', h1);

    // ---------------- H2 空画布 ----------------
    await page.evaluate(() => { document.getElementById('btn-clear-molecule').click(); window.__setHydrogenate(false); });
    await clearToast();
    await clickHydro(0);
    const h2c = await counts();
    const h2t = await toast();
    ok('H2 空画布：提示「画布上还没有分子」，零原子',
        h2t.includes('画布上还没有分子') && h2c.atoms === 0, Object.assign({}, h2c, { toast: h2t }));

    // ---------------- H3 丙烷骨架 → 8 H ----------------
    const pr = chain(3);
    await build(pr.atoms, pr.bonds);
    // 刻意保持「自动补氢」开关关闭，验证按钮独立生效
    await page.evaluate(() => window.__setHydrogenate(false));
    await clearToast();
    const h3depBefore = await page.evaluate(() => window.__history.depth());
    await clickHydro(11);
    const h3 = await page.evaluate(() => ({
        bar: window.__statusBar(),
        auto: window.__hydrogenateAuto(),
        depth: window.__history.depth(),
        toast: (document.getElementById('toast-message') || {}).textContent || ''
    }));
    const h3c = await counts();
    ok('H3 丙烷骨架点击 → 补 8 H（C3H8，11 原子），自动补氢开关仍关',
        h3c.h === 8 && h3c.atoms === 11 && h3.bar.formula === 'C3H8'
        && h3.auto === false && !h3.toast.includes('自动补氢')
        && h3.toast.includes('已补 8 个氢原子')
        && h3.depth.undo === h3depBefore.undo + 1,
        Object.assign({}, h3c, { bar: h3.bar, auto: h3.auto, toast: h3.toast, depthBefore: h3depBefore, depthAfter: h3.depth }));

    // ---------------- H4 再点一次：无新增 ----------------
    await clearToast();
    const h4depBefore = await page.evaluate(() => window.__history.depth());
    await clickHydro(0);
    const h4c = await counts();
    const h4 = await page.evaluate(() => ({
        toast: (document.getElementById('toast-message') || {}).textContent || '',
        depth: window.__history.depth()
    }));
    ok('H4 分子已饱和：提示无氢可补，原子数与历史不变',
        h4c.h === 8 && h4c.atoms === 11 && h4.toast.includes('没有需要补的氢')
        && h4.depth.undo === h4depBefore.undo,
        Object.assign({}, h4c, { toast: h4.toast, depthBefore: h4depBefore, depthAfter: h4.depth }));

    // ---------------- H5 撤销 / 恢复 ----------------
    await page.evaluate(() => window.__history.undo());
    await page.waitForTimeout(350);
    const h5a = await counts();
    await page.evaluate(() => window.__history.redo());
    await page.waitForTimeout(350);
    const h5b = await counts();
    ok('H5 撤销回到丙烷骨架（3 原子 / 0 H），恢复带回 8 H',
        h5a.atoms === 3 && h5a.h === 0 && h5b.atoms === 11 && h5b.h === 8,
        { undo: h5a, redo: h5b });

    // ---------------- H6 苯环骨架 → 6 H ----------------
    const bz = benzeneRing();
    await build(bz.atoms, bz.bonds);
    await clearToast();
    await clickHydro(12);
    const h6c = await counts();
    const h6 = await page.evaluate(() => window.__statusBar());
    const h6t = await toast();
    ok('H6 苯环骨架（1.5 键）→ 补 6 H（C6H6），芳香环保持',
        h6c.h === 6 && h6c.atoms === 12 && h6.formula === 'C6H6'
        && h6.rings === 1 && h6.aromatic === 1 && h6t.includes('已补 6 个氢原子'),
        Object.assign({}, h6c, { bar: h6, toast: h6t }));

    // ---------------- H7 结构锁拦截 ----------------
    const pr2 = chain(3);
    await build(pr2.atoms, pr2.bonds);
    await page.evaluate(() => window.__moleculeLock.set(true));
    await page.waitForTimeout(200);
    await clearToast();
    await clickHydro(0);
    const h7c = await counts();
    const h7t = await toast();
    await page.evaluate(() => window.__moleculeLock.set(false));
    ok('H7 结构锁定时点击被拦截：提示已锁定、不补氢',
        h7c.atoms === 3 && h7c.h === 0 && h7t.includes('已锁定'),
        Object.assign({}, h7c, { toast: h7t }));

    // ---------------- H8 手机 375×667 ----------------
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    const et = chain(2);
    await build(et.atoms, et.bonds);
    await page.evaluate(() => window.__setInputPanelOpen(false));
    await page.waitForTimeout(300);
    const h8ui = await page.evaluate(() => {
        const btn = document.getElementById('btn-hydrogenate');
        const r = btn.getBoundingClientRect();
        const cs = getComputedStyle(btn);
        const tb = document.getElementById('topbar').getBoundingClientRect();
        const nav = document.getElementById('topbar-actions').getBoundingClientRect();
        return {
            w: Math.round(r.width), h: Math.round(r.height),
            offsetH: btn.offsetHeight, clientH: btn.clientHeight, cssH: cs.height,
            topbarH: Math.round(tb.height), navH: Math.round(nav.height),
            innerH: innerHeight, innerW: innerWidth,
            inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0,
            labelHidden: getComputedStyle(btn.querySelector('.tb-label')).display === 'none',
            overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });
    await clearToast();
    await clickHydro(8);
    const h8c = await counts();
    const h8bar = await page.evaluate(() => window.__statusBar());
    ok('H8 375×667：按钮纯图标可见、无横向溢出、点击补 6 H（C2H6）',
        h8ui.w >= 28 && h8ui.w <= 32 && h8ui.h === 32 && h8ui.inView && h8ui.labelHidden && h8ui.overflowX === 0
        && h8c.h === 6 && h8c.atoms === 8 && h8bar.formula === 'C2H6',
        Object.assign({}, h8ui, h8c, { bar: h8bar }));

    // ---------------- H9 33 例几何自测 ----------------
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    let h9 = null;
    try {
        await page.evaluate(() => window.runAllExamplesAndTests());
        await page.waitForFunction(() => {
            const r = window.lastRunResults;
            return !!(r && r.results && r.results.length === 33);
        }, null, { timeout: 180000 });
        h9 = await page.evaluate(() => ({
            total: window.lastRunResults.results.length,
            passed: window.lastRunResults.results.filter(x => x && x.pass).length,
            fails: window.lastRunResults.results.filter(x => x && !x.pass).map(x => x.example)
        }));
    } catch (e) {
        h9 = { error: String(e && e.message || e).slice(0, 300) };
    }
    ok('H9 33 例几何自测全过', !!h9 && h9.total === 33 && h9.passed === 33, h9);

    // ---------------- H10 零 console ----------------
    ok('H10 零 console / pageerror', errs.length === 0, errs.slice(0, 8));

    const passed = results.filter(l => l.startsWith('PASS ')).length;
    console.log(`\n== verify_hydrogenate_button: ${passed}/${results.length} passed ==`);
    await browser.close();
    process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
