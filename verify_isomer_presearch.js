// 异构体「检索前筛选」（大分子式候选收窄）验证（2026-10-24）
// P 探测/抓取 API / Q 大分子式真实 UI 全流程 / R 小分子式与边界回归 / D1 33 例几何 / E1 零 console
const { chromium } = require('playwright');
(async () => {
    const results = [];
    const ok = (name, cond, extra) => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1289, height: 896 } });
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    const visible = (sel) => page.evaluate((s) => {
        const el = document.querySelector(s);
        return !!el && getComputedStyle(el).display !== 'none';
    }, sel);

    await page.goto('http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=verify_presearch', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => !!(window.__diag && window.__isomerPresearch && window.__probeFormulaCandidates && window.__fetchFormulaIsomers), null, { timeout: 30000 });

    // ============ P 探测 / 抓取 API ============
    const pBig = await page.evaluate(() => window.__probeFormulaCandidates('C12H13N3O2'));
    ok('P1 大分子式探测：超阈值 capped', !!pBig && pBig.ok === true && pBig.capped === true
        && Array.isArray(pBig.cids) && pBig.cids.length === 401 && pBig.threshold === 400,
        { ok: pBig && pBig.ok, n: pBig && pBig.cids && pBig.cids.length, capped: pBig && pBig.capped, threshold: pBig && pBig.threshold, err: pBig && pBig.error });

    const pSmall = await page.evaluate(() => window.__probeFormulaCandidates('C2H6O'));
    ok('P2 小分子式探测：未超阈值且带 CID 列表', !!pSmall && pSmall.ok === true && pSmall.capped === false
        && Array.isArray(pSmall.cids) && pSmall.cids.length > 0 && pSmall.cids.length <= 400,
        { ok: pSmall && pSmall.ok, n: pSmall && pSmall.cids && pSmall.cids.length, capped: pSmall && pSmall.capped });

    const si = await page.evaluate(async (cids) => {
        const r = await window.__fetchFormulaIsomers('C2H6O', { cids: cids });
        return { ok: r.ok, n: r.items ? r.items.length : 0, chunkFail: r.chunkFail, err: r.error,
            sample: r.items && r.items.slice(0, 3).map(i => ({ name: i.name, smiles: i.smiles, cond: i.cond })),
            hasEthanol: !!(r.items && r.items.some(i => /ethanol/i.test(i.name))) };
    }, pSmall.cids);
    ok('P3 属性抓取：C2H6O 成功且含乙醇、结构简式已生成', si.ok === true && si.n >= 2 && si.chunkFail === 0
        && si.hasEthanol && si.sample.every(s => typeof s.cond === 'string' && s.cond.length > 0),
        { n: si.n, chunkFail: si.chunkFail, err: si.err, sample: si.sample });

    // ============ Q 大分子式真实 UI 全流程 ============
    await page.evaluate(() => window.__setInputPanelOpen(true));
    await page.fill('#formula-input', 'C12H13N3O2');
    await page.press('#formula-input', 'Enter');
    await page.waitForFunction(() => window.__isomerPresearch.visible(), null, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('#isomer-pre-group-chips .isof-chip').length >= 17, null, { timeout: 10000 });
    const q1 = await page.evaluate(() => ({
        visible: window.__isomerPresearch.visible(),
        title: document.getElementById('isomer-pre-title').textContent,
        chips: document.querySelectorAll('#isomer-pre-group-chips .isof-chip').length,
        types: document.querySelectorAll('#isomer-pre-nmr-types .isof-chip').length,
        hint: document.getElementById('isomer-pre-hint').textContent,
        formula: window.__isomerPresearch.state().formula,
        isomerPanel: getComputedStyle(document.getElementById('isomer-panel')).display
    }));
    ok('Q1 大分子式打开预筛选面板（官能团 17 + 氢类型 8）', q1.visible === true
        && q1.title.indexOf('检索前筛选') >= 0 && q1.title.indexOf('C') >= 0
        && q1.chips === 17 && q1.types === 8 && q1.formula === 'C12H13N3O2'
        && q1.isomerPanel === 'none', q1);
    ok('Q2 提示语说明候选超过 400 且命中上限即停',
        q1.hint.indexOf('400') >= 0 && q1.hint.indexOf('命中达到上限即停止') >= 0,
        q1.hint.slice(0, 120));

    // 等待候选总数（后台预载）
    await page.waitForFunction(() => {
        const st = window.__isomerPresearch.state();
        return st.totalKnown === true || st.total > 0;
    }, null, { timeout: 40000 }).catch(() => {});
    const q3 = await page.evaluate(() => window.__isomerPresearch.state());
    ok('Q3 候选总数已统计（> 阈值 400）', q3.totalKnown === true && q3.total > 400, { total: q3.total, totalKnown: q3.totalKnown });

    // 非法峰组数：标红 + toast + 不启动
    await page.fill('#isomer-pre-nmr-count', '3-x');
    const q4a = await page.evaluate(() => document.getElementById('isomer-pre-nmr-count').classList.contains('isof-invalid'));
    await page.click('#isomer-pre-start');
    await page.waitForTimeout(600);
    const q4 = await page.evaluate(() => ({
        running: window.__isomerPresearch.state().running,
        matches: window.__isomerPresearch.state().matches,
        toast: document.getElementById('toast-message').textContent,
        stillOpen: window.__isomerPresearch.visible()
    }));
    ok('Q4 非法峰组数：输入框标红、toast 提示、不启动检索',
        q4a === true && q4.running === false && q4.matches === 0 && q4.stillOpen === true
        && q4.toast.indexOf('峰组数格式不正确') >= 0, q4);

    // 选「芳香环」+ 每次上限 30 → 开始检索
    await page.evaluate(() => window.__isomerPresearch.set({ groups: ['aromatic'], types: [], countRaw: '', noExch: false, mode: 'all', limit: 30 }));
    await page.click('#isomer-pre-start');
    await page.waitForFunction(() => {
        const st = window.__isomerPresearch.state();
        return st.running === false && st.matches > 0 && getComputedStyle(document.getElementById('isomer-panel')).display !== 'none';
    }, null, { timeout: 240000 });
    await page.waitForTimeout(800);
    const q5 = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#isomer-list label'));
        const shown = rows.filter(r => r.style.display !== 'none');
        const tags = shown.map(r => { const t = r.querySelector('.isof-tags'); return t ? t.textContent : ''; });
        const st = window.__isomerPresearch.state();
        const chip = document.querySelector('#isomer-group-chips .isof-chip[data-key="aromatic"]');
        return {
            st,
            rows: rows.length,
            shown: shown.length,
            allAromatic: tags.every(t => t.indexOf('芳香环') >= 0),
            tagSample: tags.slice(0, 2),
            title: document.getElementById('isomer-panel-title').textContent,
            note: document.getElementById('isomer-presearch-note-text').textContent,
            noteVisible: getComputedStyle(document.getElementById('isomer-presearch-note')).display !== 'none',
            moreShown: getComputedStyle(document.getElementById('isomer-presearch-more')).display !== 'none',
            preVisible: window.__isomerPresearch.visible(),
            filter: window.__isomerFilter.state(),
            chipOn: !!chip && chip.classList.contains('on'),
            status: document.getElementById('isomer-filter-status').textContent
        };
    });
    ok('Q5 芳香环筛选：恰取上限 30 个、全部命中芳香环',
        q5.rows === 30 && q5.shown === 30 && q5.allAromatic === true
        && q5.st.matches === 30 && q5.st.limit === 30, { rows: q5.rows, shown: q5.shown, allAromatic: q5.allAromatic, tagSample: q5.tagSample, st: q5.st });
    ok('Q6 检索后：预筛选面板关闭、结果面板标题标注「预筛选」、说明条与继续入口可见',
        q6check(q5), { title: q5.title, note: q5.note, moreShown: q5.moreShown, preVisible: q5.preVisible });
    ok('Q7 预筛选条件带入结果面板（芳香环 chip 选中、状态 30/30）',
        q5.chipOn === true && Array.isArray(q5.filter.groups) && q5.filter.groups.indexOf('aromatic') >= 0
        && q5.filter.countRaw === '' && q5.filter.mode === 'all' && q5.status.indexOf('30 / 30') >= 0,
        { chipOn: q5.chipOn, filter: q5.filter, status: q5.status });

    // 继续检索更多：追加下一批（每次上限 30）
    const before = await page.evaluate(() => window.__isomerPresearch.state().matches);
    await page.evaluate(() => window.__isomerPresearch.continue());
    await page.waitForFunction((b) => {
        const st = window.__isomerPresearch.state();
        return st.running === false && st.matches > b;
    }, before, { timeout: 240000 });
    await page.waitForTimeout(600);
    const q8 = await page.evaluate(() => ({
        st: window.__isomerPresearch.state(),
        rows: document.querySelectorAll('#isomer-list label').length,
        note: document.getElementById('isomer-presearch-note-text').textContent,
        title: document.getElementById('isomer-panel-title').textContent
    }));
    ok('Q8 继续检索更多：命中 30 → 60、行数同步、说明条与标题刷新',
        before === 30 && q8.st.matches === 60 && q8.rows === 60
        && q8.note.indexOf('命中 60') >= 0 && q8.title.indexOf('60') >= 0, { before, after: q8.st.matches, rows: q8.rows, note: q8.note, title: q8.title });

    // 换分子式重置预筛选条件（同一弹窗重开）
    await page.evaluate(() => { document.getElementById('isomer-panel-close').click(); window.__isomerPresearch.open('C4H8'); });
    await page.waitForFunction(() => window.__isomerPresearch.visible(), null, { timeout: 10000 });
    const q9 = await page.evaluate(() => window.__isomerPresearch.state());
    ok('Q9 换分子式重开：预筛选条件已重置', q9.formula === 'C4H8'
        && q9.filter.groups.length === 0 && q9.filter.types.length === 0 && q9.filter.countRaw === '',
        q9.filter);

    // Esc 关闭 + 点空白关闭
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__ddAnim && window.__ddAnim.idle(), null, { timeout: 5000 });
    const q10a = await page.evaluate(() => !window.__isomerPresearch.visible());
    await page.evaluate(() => window.__isomerPresearch.open('C12H13N3O2'));
    await page.waitForFunction(() => window.__isomerPresearch.visible(), null, { timeout: 10000 });
    await page.evaluate(() => document.getElementById('isomer-pre-panel').click());
    await page.waitForFunction(() => window.__ddAnim && window.__ddAnim.idle(), null, { timeout: 5000 });
    const q10b = await page.evaluate(() => !window.__isomerPresearch.visible());
    ok('Q10 Esc 与点空白均可关闭预筛选面板', q10a === true && q10b === true, { esc: q10a, backdrop: q10b });

    // 停止检索：窄条件（硝基+氰基）扫描较久，800ms 后停止
    await page.evaluate(() => window.__isomerPresearch.open('C12H13N3O2'));
    await page.waitForFunction(() => window.__isomerPresearch.visible(), null, { timeout: 10000 });
    await page.evaluate(() => window.__isomerPresearch.set({ groups: ['nitro', 'nitrile'], types: [], countRaw: '', limit: 120 }));
    await page.click('#isomer-pre-start');
    await page.waitForTimeout(800);
    const q11a = await page.evaluate(() => window.__isomerPresearch.state().running);
    await page.click('#isomer-pre-cancel');
    await page.waitForTimeout(400);
    const q11 = await page.evaluate(() => ({
        running: window.__isomerPresearch.state().running,
        cancelText: document.getElementById('isomer-pre-cancel').textContent,
        startText: document.getElementById('isomer-pre-start').textContent,
        startDisabled: document.getElementById('isomer-pre-start').disabled,
        visible: window.__isomerPresearch.visible()
    }));
    ok('Q11 停止检索：running 归零、按钮文案恢复、面板保留',
        q11a === true && q11.running === false && q11.cancelText === '取消'
        && q11.startText === '开始检索' && q11.startDisabled === false && q11.visible === true, q11);
    await page.click('#isomer-pre-cancel');
    await page.waitForTimeout(300);
    const q12 = await page.evaluate(() => !window.__isomerPresearch.visible());
    ok('Q12 非检索状态下「取消」关闭面板', q12 === true, { closed: q12 });

    // 无筛选 + 上限 30：按 PubChem 顺序取前 30（只扫第一页）
    await page.evaluate(() => window.__isomerPresearch.open('C12H13N3O2'));
    await page.waitForFunction(() => window.__isomerPresearch.visible(), null, { timeout: 10000 });
    await page.evaluate(() => window.__isomerPresearch.set({ groups: [], types: [], countRaw: '', noExch: false, mode: 'all', limit: 30 }));
    await page.click('#isomer-pre-start');
    await page.waitForFunction(() => {
        const st = window.__isomerPresearch.state();
        return st.running === false && st.matches > 0;
    }, null, { timeout: 180000 });
    await page.waitForTimeout(500);
    const q13 = await page.evaluate(() => ({ st: window.__isomerPresearch.state(), rows: document.querySelectorAll('#isomer-list label').length }));
    ok('Q13 不选条件：按序取前 30、扫描限制在一两页内',
        q13.st.matches === 30 && q13.rows === 30 && q13.st.scanned >= 100 && q13.st.scanned <= 200,
        { matches: q13.st.matches, rows: q13.rows, scanned: q13.st.scanned, offset: q13.st.offset });
    await page.evaluate(() => document.getElementById('isomer-panel-close').click());

    // ============ Q14/Q15 手机尺寸：不超出屏幕、矮屏可滚动 ============
    await page.setViewportSize({ width: 375, height: 667 });
    await page.evaluate(() => window.__isomerPresearch.open('C12H13N3O2'));
    await page.waitForFunction(() => window.__isomerPresearch.visible(), null, { timeout: 10000 });
    const m1 = await page.evaluate(() => {
        const p = document.getElementById('isomer-pre-panel');
        const r = p.getBoundingClientRect();
        return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
            vw: innerWidth, vh: innerHeight };
    });
    ok('Q14 手机 375×667：预筛选面板不超出屏幕',
        m1.l >= 0 && m1.t >= 0 && m1.l + m1.w <= m1.vw && m1.t + m1.h <= m1.vh && m1.w <= m1.vw, m1);
    await page.setViewportSize({ width: 375, height: 400 });
    await page.waitForTimeout(300);
    const m2 = await page.evaluate(() => {
        const p = document.getElementById('isomer-pre-panel');
        const r = p.getBoundingClientRect();
        return { t: Math.round(r.top), b: Math.round(r.bottom), vh: innerHeight,
            w: Math.round(r.width), vw: innerWidth,
            canScroll: p.scrollHeight > p.clientHeight, overflowY: getComputedStyle(p).overflowY };
    });
    ok('Q15 手机矮屏 375×400：限高生效且面板可滚动', m2.t >= 0 && m2.b <= m2.vh && m2.w <= m2.vw
        && m2.canScroll === true && m2.overflowY === 'auto', m2);
    await page.evaluate(() => window.__isomerPresearch.close());
    await page.setViewportSize({ width: 1289, height: 896 });
    await page.waitForTimeout(300);

    // ============ R 小分子式 / 旧路径回归 ============
    await page.evaluate(() => window.__setInputPanelOpen(true));
    await page.fill('#formula-input', 'C2H6O');
    await page.press('#formula-input', 'Enter');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('isomer-panel')).display !== 'none', null, { timeout: 90000 });
    const r1 = await page.evaluate(() => ({
        pre: window.__isomerPresearch.visible(),
        rows: document.querySelectorAll('#isomer-list label').length,
        title: document.getElementById('isomer-panel-title').textContent,
        note: getComputedStyle(document.getElementById('isomer-presearch-note')).display,
        hasEthanol: document.getElementById('isomer-list').textContent.toLowerCase().indexOf('ethanol') >= 0
    }));
    ok('R1 小分子式 C2H6O：直接出结果面板、不弹预筛选、无说明条',
        r1.pre === false && r1.rows === 2 && r1.note === 'none'
        && r1.title.indexOf('2 个') >= 0 && r1.hasEthanol === true, r1);
    await page.evaluate(() => document.getElementById('isomer-panel-close').click());
    await page.waitForTimeout(300);

    await page.evaluate(() => window.__setInputPanelOpen(true));
    await page.fill('#formula-input', 'C6H6');
    await page.press('#formula-input', 'Enter');
    await page.waitForFunction(() => window.__isomerPresearch.visible() || getComputedStyle(document.getElementById('isomer-panel')).display !== 'none', null, { timeout: 90000 });
    const r2 = await page.evaluate(() => ({
        pre: window.__isomerPresearch.visible(),
        isomerOpen: getComputedStyle(document.getElementById('isomer-panel')).display !== 'none',
        title: document.getElementById('isomer-panel-title').textContent,
        hasBenzene: document.getElementById('isomer-list').textContent.toLowerCase().indexOf('benzene') >= 0,
        atoms: (window.__lpStats ? window.__lpStats().length : 0)
    }));
    ok('R2 分子式 C6H6 不再被当 SMILES：进入异构体枚举并含苯', (r2.pre === true || r2.isomerOpen === true)
        && r2.hasBenzene === true && r2.atoms === 0, r2);
    await page.evaluate(() => { window.__isomerPresearch.close(); document.getElementById('isomer-panel-close').click(); });

    // ============ D1 页面 33 例几何自测回归（3 参 waitForFunction） ============
    await page.evaluate(() => { window.lastRunResults = null; setTimeout(() => { try { runAllExamplesAndTests(); } catch (e) {} }, 0); });
    await page.waitForFunction(() => !!window.lastRunResults && Array.isArray(window.lastRunResults.results) && window.lastRunResults.results.length >= 33, null, { timeout: 240000 }).catch(() => {});
    const auto = await page.evaluate(() => {
        const lrr = window.lastRunResults;
        if (!lrr || !Array.isArray(lrr.results)) return null;
        return { n: lrr.results.length, fails: lrr.results.filter(r => !r.pass).map(r => r.example) };
    });
    if (auto) ok('D1 页面 33 例自测全过（' + (auto.n - auto.fails.length) + '/' + auto.n + '）', auto.n >= 33 && auto.fails.length === 0, auto.fails.length ? auto.fails : undefined);
    else ok('D1 页面自测结果可读', false, { lastRunResults: 'missing' });

    ok('E1 零 console 错误', errs.length === 0, errs.slice(0, 3));
    console.log(results.join('\n'));
    const failed = results.filter(r => r.startsWith('FAIL'));
    console.log(failed.length ? ('RESULT: ' + failed.length + ' FAILED') : 'RESULT: ALL PASS');
    await browser.close();
    process.exit(failed.length ? 1 : 0);

    function q6check(q) {
        return q.preVisible === false && q.noteVisible === true && q.moreShown === true
            && q.title.indexOf('预筛选') >= 0 && q.note.indexOf('已扫描') >= 0 && q.note.indexOf('命中 30') >= 0;
    }
})();
