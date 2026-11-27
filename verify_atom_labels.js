// 验证：检查器「视图 → 原子标签」开关 + 标签被前方原子遮挡（球棍模型4.html）
// 运行: cmd /c "node verify_atom_labels.js > verify_atom_labels.log 2>&1"
// 前置: 仓库根目录已起 python -m http.server 8000
//
// 覆盖：
//   L1 DOM/接口就绪（chk-labels 在视图段、视图共 6 行、__atomLabels/__atomLabelOcclusion）
//   L2 默认开启：甲烷 5 个标签可见
//   L3 真实鼠标点行文字关闭 / 点滑块开启（整行可点、无双重翻转）
//   L4 关闭时新生成分子不建标签；开启后对既有分子懒补建
//   L5 遮挡：标签锚点被更靠近相机的原子挡住 → 隐藏；移开后恢复
//   L6 localStorage 持久化：reload 后保持关闭
//   L7 与既有 5 个视图开关互不干扰
//   L8 正常分子不触发 sparse 提示
//   L9 33 例几何自测全过
//   L10 零 console / pageerror
const { chromium } = require('playwright-core');

const URL = 'http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=labels1';

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
    // CSS2D 会把 visible=false 的标签 display:none，所以「可见」以元素样式为准，
    // 不能只看 userData.visible（两者一致，但 DOM 才是用户真正看到的）。
    const domLabels = () => page.evaluate(() => {
        const all = [...document.querySelectorAll('#canvas-host div[data-role="atom-label"]')];
        const shown = all.filter(d => d.style.display !== 'none' && d.textContent.trim().length > 0);
        return { total: all.length, shown: shown.length, texts: [...new Set(shown.map(d => d.textContent))] };
    });
    const lblState = () => page.evaluate(() => {
        const s = window.__atomLabels.state();
        const chk = document.getElementById('chk-labels');
        const row = chk && chk.closest('.toggle-row');
        return { ...s, checked: !!chk.checked, rowOn: !!(row && row.classList.contains('on')) };
    });
    const clickRow = async (id) => {
        const p = await page.evaluate((sel) => {
            const r = document.querySelector(sel).getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }, id);
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(450);
    };

    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__diag && window.__atomLabels && window.__atomLabelOcclusion && window.__statusBar), null, { timeout: 60000 });
    await page.evaluate(() => {
        window.__setInputPanelOpen(false);
        localStorage.removeItem('ATOM_LABELS_VISIBLE');   // 以「缺省=开启」为基准
        document.getElementById('btn-clear-molecule').click();
    });
    await page.waitForTimeout(400);

    // ---------------- L1 DOM / 接口 ----------------
    const l1 = await page.evaluate(() => {
        const chk = document.getElementById('chk-labels');
        const name = document.getElementById('btn-toggle-labels');
        const body = document.getElementById('inspect-body');
        const rows = [...document.querySelectorAll('#inspect-body .ins-sec .toggle-row')];
        const labelsRowIdx = rows.findIndex(r => r.contains(chk));
        return {
            hasChk: !!chk,
            hasName: !!name,
            nameText: name ? name.textContent : '',
            inBody: !!(chk && body && body.contains(chk)),
            rowCount: rows.length,
            rowIds: rows.map(r => (r.querySelector('input[type=checkbox]') || {}).id || ''),
            labelsRowIdx,
            sub: window.__atomLabels ? Object.keys(window.__atomLabels).join(',') : '',
            occKeys: window.__atomLabelOcclusion ? Object.keys(window.__atomLabelOcclusion).join(',') : '',
            occInterval: window.__atomLabelOcclusion ? window.__atomLabelOcclusion.intervalMs : 0
        };
    });
    ok('L1 视图段「原子标签」开关（第 3 行，共 6 行）+ 调试接口就绪',
        l1.hasChk && l1.hasName && l1.nameText === '原子标签' && l1.inBody
        && l1.rowCount === 6 && l1.rowIds[2] === 'chk-labels' && l1.rowIds[1] === 'chk-lp'
        && l1.sub === 'get,set,toggle,state'
        && l1.occKeys === 'intervalMs,update,stats,reset' && l1.occInterval > 0, l1);

    // ---------------- L2 默认开启：甲烷 6 标签 ----------------
    await page.evaluate(() => window.__diag.generate('methane'));
    await page.waitForTimeout(700);
    const l2dom = await domLabels();
    const l2st = await lblState();
    ok('L2 默认开启：甲烷 5 个原子全部显示元素标签',
        l2dom.total === 5 && l2dom.shown === 5 && l2dom.texts.includes('C') && l2dom.texts.includes('H')
        && l2st.enabled === true && l2st.labels === 5 && l2st.visibleLabels === 5
        && l2st.checked === true && l2st.rowOn === true && l2st.sparse === false, { dom: l2dom, st: l2st });

    // ---------------- L3 整行可点（真实鼠标）----------------
    await clickRow('#btn-toggle-labels');                 // 点文字 → 关
    const l3off = { dom: await domLabels(), st: await lblState() };
    await clickRow('#chk-labels ~ .switch');              // 点滑块 → 开
    const l3on = { dom: await domLabels(), st: await lblState() };
    ok('L3 点行文字关闭 / 点滑块开启：各翻一次，标签 DOM 同步隐藏/恢复',
        l3off.dom.shown === 0 && l3off.st.checked === false && l3off.st.rowOn === false
        && l3off.st.enabled === false
        && l3on.dom.shown === 5 && l3on.st.checked === true && l3on.st.rowOn === true
        && l3on.st.enabled === true && l3on.st.labels === 5, { off: l3off, on: l3on });

    // ---------------- L4 关闭时不建新标签；开启后懒补建 ----------------
    await page.evaluate(() => window.__atomLabels.set(false));
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__diag.generate('ethane'));
    await page.waitForTimeout(550);
    const l4off = { dom: await domLabels(), st: await lblState() };
    await page.evaluate(() => window.__atomLabels.set(true));
    await page.waitForTimeout(550);
    const l4on = { dom: await domLabels(), st: await lblState() };
    ok('L4 关闭时新分子零标签；开启后对既有分子懒补建 8 个',
        l4off.dom.total === 0 && l4off.dom.shown === 0 && l4off.st.labels === 0
        && l4on.dom.total === 8 && l4on.dom.shown === 8 && l4on.st.labels === 8,
        { off: l4off, on: l4on });

    // ---------------- L5 透视遮挡 ----------------
    // 把一颗碘放到 C 标签锚点正前方（沿相机视线往镜头挪 0.5Å）：屏幕距离≈0、
    // 深度近 0.5Å → 该 C 标签应被判定为「被挡」并隐藏；移开后立即恢复。
    // 注意 dir 必须取 pos - target（指向镜头），反了会把掩体放到更远处。
    // label 是原子的子对象、锚点恒在局部 +Y：世界位置 = 原子位置 + label.position。
    const l5 = await page.evaluate(async () => {
        const frame2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const domCount = () => {
            const all = [...document.querySelectorAll('#canvas-host div[data-role="atom-label"]')];
            return { total: all.length, shown: all.filter(d => d.style.display !== 'none').length };
        };
        const anchorOf = (atom) => {
            const lp = atom.userData.label ? atom.userData.label.position : { x: 0, y: 0.6, z: 0 };
            return { x: atom.position.x + lp.x, y: atom.position.y + lp.y, z: atom.position.z + lp.z };
        };

        document.getElementById('btn-clear-molecule').click();
        await frame2();
        const C = window.__createHeavyAtom('C', { x: 0, y: 0, z: 0 });
        await frame2();
        const cam = window.__diag.camInfo();
        const v = [cam.pos[0] - cam.target[0], cam.pos[1] - cam.target[1], cam.pos[2] - cam.target[2]];
        const L = Math.hypot(v[0], v[1], v[2]) || 1;
        const a = anchorOf(C);
        window.__createHeavyAtom('I', {
            x: a.x + v[0] / L * 0.5,
            y: a.y + v[1] / L * 0.5,
            z: a.z + v[2] / L * 0.5
        });
        await frame2();
        window.__atomLabelOcclusion.update(true);
        const withMask = window.__atomLabelOcclusion.stats();
        const stateMask = window.__atomLabels.state();
        await new Promise(r => setTimeout(r, 150));
        const domMask = domCount();

        document.getElementById('btn-clear-molecule').click();
        window.__createHeavyAtom('C', { x: 0, y: 0, z: 0 });
        await frame2();
        window.__atomLabelOcclusion.update(true);
        const noMask = window.__atomLabelOcclusion.stats();
        const stateNo = window.__atomLabels.state();
        await new Promise(r => setTimeout(r, 150));
        const domNo = domCount();
        return { withMask, stateMask, domMask, noMask, stateNo, domNo };
    });
    ok('L5 标签被更靠近相机的原子挡住时隐藏、移开后恢复',
        l5.withMask.hidden >= 1 && l5.withMask.labels >= 2 && l5.stateMask.hiddenLabels >= 1
        && l5.domMask.shown < l5.domMask.total
        && l5.noMask.hidden === 0 && l5.stateNo.hiddenLabels === 0 && l5.stateNo.visibleLabels === 1
        && l5.domNo.shown === l5.domNo.total, l5);

    // ---------------- L6 持久化 ----------------
    await page.evaluate(() => window.__atomLabels.set(false));
    await page.waitForTimeout(250);
    const stored = await page.evaluate(() => localStorage.getItem('ATOM_LABELS_VISIBLE'));
    await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__diag && window.__atomLabels), null, { timeout: 60000 });
    await page.evaluate(() => window.__setInputPanelOpen(false));
    await page.waitForTimeout(350);
    const l6before = await lblState();
    await page.evaluate(() => window.__diag.generate('methane'));
    await page.waitForTimeout(600);
    const l6dom = await domLabels();
    ok('L6 关闭状态持久化：reload 后仍关闭、新分子零标签',
        stored === '0' && l6before.enabled === false && l6before.checked === false
        && l6before.rowOn === false && l6dom.total === 0 && l6dom.shown === 0,
        { stored, before: l6before, dom: l6dom });
    await page.evaluate(() => window.__atomLabels.set(true));
    await page.waitForTimeout(450);
    const l6on = await domLabels();
    ok('L6b 重新开启后标签回归',
        l6on.total === 5 && l6on.shown === 5, l6on);

    // ---------------- L7 与既有开关互不干扰 ----------------
    const l7before = await page.evaluate(() => ({
        hydro: document.getElementById('chk-hydro').checked,
        lp: document.getElementById('chk-lp').checked,
        grid: document.getElementById('chk-grid').checked,
        deloc: document.getElementById('chk-deloc').checked,
        pi: document.getElementById('chk-pi').checked
    }));
    for (const sel of ['#chk-hydro', '#chk-lp', '#chk-grid', '#chk-deloc', '#chk-pi']) {
        await clickRow(sel + ' ~ .switch');
    }
    const l7after = await page.evaluate(() => ({
        hydro: document.getElementById('chk-hydro').checked,
        lp: document.getElementById('chk-lp').checked,
        grid: document.getElementById('chk-grid').checked,
        deloc: document.getElementById('chk-deloc').checked,
        pi: document.getElementById('chk-pi').checked
    }));
    const l7lbl = await lblState();
    ok('L7 点击其他开关不会误翻原子标签（彼此独立）',
        JSON.stringify(l7before) !== JSON.stringify(l7after)
        && l7lbl.enabled === true && l7lbl.checked === true && l7lbl.rowOn === true, { before: l7before, after: l7after, lbl: l7lbl });

    // ---------------- L8 不误触发 sparse 提示 ----------------
    const l8 = await lblState();
    ok('L8 正常分子（< SPARSE_VISUAL_ATOMS）sparse=false，不触发省略提示',
        l8.sparse === false && l8.enabled === true, l8);

    // ---------------- L9 33 例几何自测 ----------------
    let l9 = null;
    try {
        await page.evaluate(() => window.runAllExamplesAndTests());
        await page.waitForFunction(() => {
            const r = window.lastRunResults;
            return !!(r && r.results && r.results.length === 33);
        }, null, { timeout: 180000 });
        l9 = await page.evaluate(() => ({
            total: window.lastRunResults.results.length,
            passed: window.lastRunResults.results.filter(x => x && x.pass).length,
            fails: window.lastRunResults.results.filter(x => x && !x.pass).map(x => x.example)
        }));
    } catch (e) {
        l9 = { error: String(e && e.message || e).slice(0, 300) };
    }
    ok('L9 33 例几何自测全过', !!l9 && l9.total === 33 && l9.passed === 33, l9);

    // ---------------- L10 零 console ----------------
    ok('L10 零 console / pageerror', errs.length === 0, errs.slice(0, 8));

    const passed = results.filter(l => l.startsWith('PASS ')).length;
    console.log(`\n== verify_atom_labels: ${passed}/${results.length} passed ==`);
    await browser.close();
    process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });