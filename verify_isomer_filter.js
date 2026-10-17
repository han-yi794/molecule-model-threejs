// 异构体候选筛选（官能团 + ¹H NMR 氢谱特征）验证（2026-10）
// L 分析器纯函数电池 / M 真实 UI 筛选 / D1 33 例几何自测回归 / E1 零 console 错误
const { chromium } = require('playwright');
(async () => {
    const results = [];
    const ok = (name, cond, extra) => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.goto('http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html');
    await page.waitForFunction(() => window.__isomerFilter && window.__setInputPanelOpen && window.__analyzeIsomerStructure, null, { timeout: 30000 });

    // ============ L 分析器电池（纯函数） ============
    const battery = [
        ['CCO',            { g: ['oh', 'methyl'], count: 3, ratio: '3:2:1', no: 2, ratioNo: '3:2', types: ['oh'] }],
        ['COC',            { g: ['ether'], ng: ['oh'], count: 1, ratio: '6H' }],
        ['CC=O',           { g: ['ald', 'methyl'], count: 2, ratio: '3:1', types: ['ald'] }],
        ['C=O',            { g: ['ald'], count: 1, ratio: '2H', types: ['ald'] }],
        ['CC(=O)O',        { g: ['cooh', 'oh', 'methyl'], count: 2, ratio: '3:1', no: 1, ratioNo: '3H', types: ['cooh', 'oh'] }],
        ['CC(=O)OC',       { g: ['ester', 'methyl'], ng: ['ether', 'cooh'], count: 2, ratio: '1:1' }],
        ['COC=O',          { g: ['ester'], ng: ['cooh'], count: 2, ratio: '3:1', types: ['ald'] }],
        ['CC(=O)C',        { g: ['ketone', 'methyl'], ng: ['ald'], count: 1, ratio: '6H' }],
        ['CCN',            { g: ['amine', 'methyl'], ng: ['amide'], count: 3, types: ['nh'] }],
        ['CN',             { g: ['amine'], count: 2, ratio: '3:2', types: ['nh'] }],
        ['c1ccccc1',       { g: ['benzene', 'aromatic', 'ring'], ng: ['methyl', 'c=c'], count: 1, ratio: '6H', types: ['ar'] }],
        ['C1=CC=CC=C1',    { g: ['benzene', 'aromatic'], ng: ['c=c'], count: 1, ratio: '6H', types: ['ar'] }],
        ['Cc1ccccc1',      { g: ['benzene', 'methyl'], count: 4, ratio: '3:2:2:1' }],
        ['C1CCCCC1',       { g: ['ring'], ng: ['aromatic'], count: 1, ratio: '12H' }],
        ['C=CC',           { g: ['c=c', 'methyl'], ng: ['ring'], count: 3, ratio: '2:1:3', types: ['ene'] }],
        ['C#CC',           { g: ['c#c', 'methyl'], count: 2, ratio: '1:3', types: ['yne'] }],
        ['ClCCl',          { g: ['halogen'], count: 1, ratio: '2H' }],
        ['CC(=O)N',        { g: ['amide', 'methyl'], ng: ['amine', 'ketone'], count: 2, ratio: '3:2', types: ['nh'] }],
        ['C#N',            { g: ['nitrile'], count: 1, ratio: '1H' }],
        ['CC(C)C',         { g: ['methyl'], count: 2, ratio: '9:1' }],
        ['CN(=O)=O',       { g: ['nitro'], ng: ['amine', 'methyl'], count: 1, ratio: '3H' }],
        ['C1=CC=NC=C1',    { g: ['aromatic', 'ring'], ng: ['benzene', 'amine'], count: 3, ratio: '1:2:2', types: ['ar'] }],
        ['c1ccncc1',       { g: ['aromatic'], ng: ['benzene'], count: 3, ratio: '1:2:2', types: ['ar'] }],
        ['c1cc[nH]c1',     { g: ['aromatic'], ng: ['benzene', 'amine'], count: 3, ratio: '2:2:1', types: ['ar', 'nh'] }],
        ['Cn1cccc1',       { g: ['aromatic'], ng: ['amine'], count: 3, ratio: '3:2:2', types: ['ar'] }],
        ['c1ccoc1',        { g: ['aromatic'], ng: ['ether', 'benzene'], count: 2, ratio: '1:1', types: ['ar'] }],
        ['C=CC1=CC=CC=C1', { g: ['benzene', 'c=c'], count: 5, ratio: '2:1:2:2:1', types: ['ar', 'ene'] }],
        ['O=C1C=CC(=O)C=C1', { g: ['ketone', 'c=c'], ng: ['aromatic', 'benzene'], count: 1, ratio: '4H' }],
        ['C1=COC=C1',      { g: ['aromatic'], ng: ['ether', 'c=c'], count: 2, ratio: '1:1', types: ['ar'] }],
        ['C1=CC2=CC=CC=C2C=C1', { g: ['benzene', 'aromatic'], count: 2, ratio: '1:1' }],
        ['c1ccc2ccccc2c1', { g: ['benzene'], count: 2, ratio: '1:1' }],
        ['C1=CC=C(C=C1)C2=CC=CC=C2', { g: ['benzene'], count: 3, ratio: '1:2:2' }],
        ['C=C1C=CC=C1',    { g: ['ring', 'c=c'], ng: ['aromatic', 'benzene'] }],
        ['CCCC',           { g: ['methyl'], count: 2, ratio: '3:2' }],
        ['C1CC1',          { g: ['ring'], count: 1, ratio: '6H' }],
        ['FC(F)(F)F',      { g: ['halogen'], count: 0 }],
        ['CS',             { count: 2, ratio: '3:1', types: ['sh'] }],
        ['Oc1ccccc1',      { g: ['oh', 'benzene'], count: 4, ratio: '1:2:2:1', no: 3, ratioNo: '2:2:1', types: ['ar', 'oh'] }],
        ['CC(=O)OCC',      { g: ['ester', 'methyl'], ng: ['ether'], count: 3, ratio: '3:2:3' }],
    ];
    const bat = await page.evaluate((cases) => cases.map(([smi, exp]) => {
        let an = null, threw = null;
        try { an = window.__isomerFilter.analyze(smi); } catch (e) { threw = String(e); }
        return { smi, exp, threw, an: an ? { groups: an.groups, count: an.count, ratio: an.ratio, countNoExch: an.countNoExch, ratioNoExch: an.ratioNoExch, hTypes: an.hTypes } : null };
    }), battery);
    const badBat = [];
    for (const b of bat) {
        const e = b.exp, a = b.an, f = [];
        if (b.threw) f.push('THREW ' + b.threw);
        else if (!a) f.push('null');
        else {
            (e.g || []).forEach(k => { if (!a.groups.includes(k)) f.push('miss:' + k); });
            (e.ng || []).forEach(k => { if (a.groups.includes(k)) f.push('has:' + k); });
            if (e.count !== undefined && a.count !== e.count) f.push('count ' + a.count + '!=' + e.count);
            if (e.ratio !== undefined && a.ratio !== e.ratio) f.push('ratio ' + a.ratio + '!=' + e.ratio);
            if (e.no !== undefined && a.countNoExch !== e.no) f.push('no ' + a.countNoExch + '!=' + e.no);
            if (e.ratioNo !== undefined && a.ratioNoExch !== e.ratioNo) f.push('ratioNo ' + a.ratioNoExch + '!=' + e.ratioNo);
            (e.types || []).forEach(k => { if (!a.hTypes[k]) f.push('missT:' + k); });
        }
        if (f.length) badBat.push({ smi: b.smi, f });
    }
    ok('L1 分析器电池 ' + (battery.length - badBat.length) + '/' + battery.length, badBat.length === 0, badBat.slice(0, 6));

    const pc = await page.evaluate(() => ({
        eq: window.__isomerFilter.parseCount('3'),
        ge: window.__isomerFilter.parseCount('≥3'),
        range: window.__isomerFilter.parseCount('2-4'),
        range2: window.__isomerFilter.parseCount('3至5'),
        bad: window.__isomerFilter.parseCount('abc'),
        bad2: window.__isomerFilter.parseCount('12x'),
        empty: window.__isomerFilter.parseCount(''),
        m1: window.__isomerFilter.matchCount(window.__isomerFilter.parseCount('≥3'), 3),
        m2: window.__isomerFilter.matchCount(window.__isomerFilter.parseCount('≥3'), 2),
        m3: window.__isomerFilter.matchCount(window.__isomerFilter.parseCount('2-4'), 5),
        m4: window.__isomerFilter.matchCount(window.__isomerFilter.parseCount('<5'), 4),
        m5: window.__isomerFilter.matchCount(window.__isomerFilter.parseCount('>2组'), 2),
    }));
    ok('L2 峰组数表达式解析/匹配', !!pc.eq && pc.eq.kind === 'cmp' && pc.eq.op === '=' && pc.eq.n === 3
        && !!pc.ge && pc.ge.op === '>=' && pc.ge.n === 3
        && !!pc.range && pc.range.lo === 2 && pc.range.hi === 4
        && !!pc.range2 && pc.range2.lo === 3 && pc.range2.hi === 5
        && pc.bad === undefined && pc.bad2 === undefined && pc.empty === null
        && pc.m1 === true && pc.m2 === false && pc.m3 === false && pc.m4 === true && pc.m5 === false, pc);

    // ============ M 真实 UI：C2H6O ============
    const openPanel = async (formula, titleSub) => {
        await page.evaluate(() => window.__setInputPanelOpen(true));
        await page.fill('#formula-input', formula);
        await page.press('#formula-input', 'Enter');
        await page.waitForFunction((sub) => {
            const p = document.getElementById('isomer-panel');
            const t = document.getElementById('isomer-panel-title');
            return p && p.style.display === 'flex' && t && t.textContent.indexOf(sub) >= 0 && document.querySelectorAll('#isomer-list label').length >= 2;
        }, titleSub, { timeout: 60000 });
        await page.waitForTimeout(400);
    };
    await openPanel('C2H6O', 'C\u2082H\u2086O');
    const st0 = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#isomer-list label'));
        return {
            rows: rows.length,
            tags: rows.map(r => { const t = r.querySelector('.isof-tags'); return t ? t.textContent : null; }),
            chipsG: document.querySelectorAll('#isomer-group-chips .isof-chip').length,
            chipsT: document.querySelectorAll('#isomer-nmr-types .isof-chip').length,
            status: document.getElementById('isomer-filter-status').textContent,
        };
    });
    ok('M1 面板 2 行且带标签行（基团+¹H NMR）', st0.rows === 2 && st0.tags.every(t => t && t.indexOf('基团：') >= 0 && t.indexOf('¹H NMR：') >= 0), st0.tags);
    ok('M2 chips 17 官能团 + 8 氢类型', st0.chipsG === 17 && st0.chipsT === 8, { g: st0.chipsG, t: st0.chipsT });
    ok('M3 初始全显示 2/2', st0.status.indexOf('显示 2 / 2') >= 0, st0.status);
    const ethTag = st0.tags.find(t => t && t.indexOf('羟基') >= 0) || '';
    ok('M4 乙醇标签 3 组 (3:2:1)', /3 组 \(3:2:1\)/.test(ethTag), ethTag);
    const ethRow = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#isomer-list label'));
        const r = rows.find(r => r._an && r._an.groups.includes('oh'));
        return r ? r.textContent : null;
    });
    ok('M5 行文本保留名称/下标简式/SMILES', !!ethRow && ethRow.indexOf('ethanol') >= 0 && ethRow.indexOf('CH\u2083CH\u2082OH') >= 0 && ethRow.indexOf('CCO') >= 0, ethRow);

    // 点击"羟基" chip → 只剩乙醇
    await page.click('#isomer-group-chips .isof-chip[data-scope="g"][data-key="oh"]');
    const f1 = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#isomer-list label'));
        return {
            vis: rows.filter(r => r.style.display !== 'none').length,
            visHasOh: rows.filter(r => r.style.display !== 'none').every(r => r._an && r._an.groups.includes('oh')),
            hidNoOh: rows.filter(r => r.style.display === 'none').every(r => !(r._an && r._an.groups.includes('oh'))),
            chipOn: !!document.querySelector('#isomer-group-chips .isof-chip[data-key="oh"].on'),
            status: document.getElementById('isomer-filter-status').textContent,
        };
    });
    ok('M6 官能团 chip（羟基）→ 精确过滤 1/2', f1.vis === 1 && f1.visHasOh && f1.hidNoOh && f1.chipOn && f1.status.indexOf('显示 1 / 2') >= 0, f1);

    // 羟基氢 chip + 排除活泼氢 → 标签刷新
    await page.click('#isomer-nmr-types .isof-chip[data-scope="t"][data-key="oh"]');
    await page.check('#isomer-nmr-noexch');
    const f2 = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#isomer-list label'));
        const r = rows.find(r => r.style.display !== 'none');
        return { tags: rows.map(r => r.querySelector('.isof-tags') ? r.querySelector('.isof-tags').textContent : ''), visTag: r ? r.querySelector('.isof-tags').textContent : '' };
    });
    ok('M7 排除活泼氢 → 标签刷新为 2 组 (3:2)', f2.visTag.indexOf('2 组 (3:2)') >= 0 && f2.visTag.indexOf('不含活泼氢') >= 0, f2.visTag);

    // 峰组数 2 → 乙醇可见；3 → 0 行
    await page.fill('#isomer-nmr-count', '2');
    const f3 = await page.evaluate(() => document.getElementById('isomer-filter-status').textContent);
    await page.fill('#isomer-nmr-count', '3');
    const f4 = await page.evaluate(() => document.getElementById('isomer-filter-status').textContent);
    ok('M8 峰组数=2 命中乙醇 / =3 无命中', f3.indexOf('显示 1 / 2') >= 0 && f4.indexOf('显示 0 / 2') >= 0, { f3, f4 });

    // 非法输入 → 标红且忽略（条件只留 chip）
    await page.fill('#isomer-nmr-count', 'abc');
    const f5 = await page.evaluate(() => ({
        invalid: document.getElementById('isomer-nmr-count').classList.contains('isof-invalid'),
        status: document.getElementById('isomer-filter-status').textContent,
    }));
    ok('M9 非法表达式标红并忽略', f5.invalid && f5.status.indexOf('显示 1 / 2') >= 0, f5);
    await page.fill('#isomer-nmr-count', '');

    // 重置 → 恢复 2/2 且 chips 熄灭
    await page.click('#isomer-filter-reset');
    const f6 = await page.evaluate(() => ({
        status: document.getElementById('isomer-filter-status').textContent,
        onG: document.querySelectorAll('#isomer-group-chips .isof-chip.on').length,
        onT: document.querySelectorAll('#isomer-nmr-types .isof-chip.on').length,
        noexch: document.getElementById('isomer-nmr-noexch').checked,
        tags: Array.from(document.querySelectorAll('#isomer-list label .isof-tags')).map(t => t.textContent),
    }));
    ok('M10 重置筛选（2/2 + chips 熄灭 + 标签复原）', f6.status.indexOf('显示 2 / 2') >= 0 && f6.onG === 0 && f6.onT === 0 && !f6.noexch && f6.tags.every(t => t.indexOf('不含活泼氢') < 0), f6);

    // 行点击（真实鼠标：勾选框中心；再点行文字区域）
    const cbBox = await page.locator('#isomer-list label input[type="checkbox"]').first().boundingBox();
    let rowToggle = null;
    if (cbBox) {
        await page.mouse.click(cbBox.x + cbBox.width / 2, cbBox.y + cbBox.height / 2);
        const t1 = await page.evaluate(() => ({ n: document.querySelectorAll('#isomer-list input[type="checkbox"]:checked').length, cnt: document.getElementById('isomer-count').textContent }));
        await page.mouse.click(cbBox.x + cbBox.width / 2, cbBox.y + cbBox.height / 2);
        const t2 = await page.evaluate(() => document.querySelectorAll('#isomer-list input[type="checkbox"]:checked').length);
        rowToggle = { t1, t2 };
    }
    ok('M11a 勾选框点击（1→0 且计数同步）', !!rowToggle && rowToggle.t1.n === 1 && /已选 1 个/.test(rowToggle.t1.cnt) && rowToggle.t2 === 0, rowToggle);
    const infoBox = await page.locator('#isomer-list label').first().boundingBox();
    let textToggle = null;
    if (infoBox) {
        const px = infoBox.x + 40, py = infoBox.y + 12;
        await page.mouse.click(px, py);
        const a = await page.evaluate(() => document.querySelectorAll('#isomer-list input[type="checkbox"]:checked').length);
        await page.mouse.click(px, py);
        const b = await page.evaluate(() => document.querySelectorAll('#isomer-list input[type="checkbox"]:checked').length);
        textToggle = { a, b };
    }
    ok('M11b 行文字点击（1→0）', !!textToggle && textToggle.a === 1 && textToggle.b === 0, textToggle);

    // 全选只作用于可见行
    await page.click('#isomer-group-chips .isof-chip[data-scope="g"][data-key="oh"]');   // 只剩乙醇可见
    await page.click('#isomer-select-all');
    const sa = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#isomer-list label'));
        return {
            checkedTotal: rows.filter(r => r.querySelector('input') && r.querySelector('input').checked).length,
            checkedVis: rows.filter(r => r.style.display !== 'none' && r.querySelector('input').checked).length,
            vis: rows.filter(r => r.style.display !== 'none').length,
            cnt: document.getElementById('isomer-count').textContent,
        };
    });
    ok('M12 全选仅作用可见行（' + sa.checkedTotal + ' 选中 / ' + sa.vis + ' 可见）', sa.checkedTotal === 1 && sa.checkedVis === 1 && sa.vis === 1 && /已选 1 个/.test(sa.cnt), sa);
    await page.click('#isomer-select-all');
    const sa2 = await page.evaluate(() => document.querySelectorAll('#isomer-list input[type="checkbox"]:checked').length);
    ok('M13 取消全选', sa2 === 0, sa2);

    // 多条件：满足任一 / 满足全部
    await page.fill('#isomer-nmr-count', '1');   // 甲醚 count=1
    await page.selectOption('#isomer-filter-mode', 'any');
    const g1 = await page.evaluate(() => document.getElementById('isomer-filter-status').textContent);
    await page.selectOption('#isomer-filter-mode', 'all');
    const g2 = await page.evaluate(() => document.getElementById('isomer-filter-status').textContent);
    ok('M14 多条件任一=2/2、全部=0/2', g1.indexOf('显示 2 / 2') >= 0 && g2.indexOf('显示 0 / 2') >= 0, { g1, g2 });

    // 关闭再打开 → 筛选状态重置
    await page.evaluate(() => document.getElementById('isomer-panel-close').click());
    await page.waitForFunction(() => document.getElementById('isomer-panel').style.display === 'none', null, { timeout: 6000 });
    await openPanel('C2H6O', 'C\u2082H\u2086O');
    const rst = await page.evaluate(() => ({
        status: document.getElementById('isomer-filter-status').textContent,
        onG: document.querySelectorAll('#isomer-group-chips .isof-chip.on').length,
        cnt: document.getElementById('isomer-nmr-count').value,
        mode: document.getElementById('isomer-filter-mode').value,
    }));
    ok('M15 重开面板筛选重置', rst.status.indexOf('显示 2 / 2') >= 0 && rst.onG === 0 && rst.cnt === '' && rst.mode === 'all', rst);

    // ============ M 真实 UI：C4H8（数据驱动断言） ============
    await page.evaluate(() => document.getElementById('isomer-panel-close').click());
    await openPanel('C4H8', 'C\u2084H\u2088');
    const c4 = await page.evaluate(() => window.__isomerFilter.rows());
    const expRing = c4.filter(r => r.an && r.an.groups.includes('ring')).length;
    const expCC = c4.filter(r => r.an && r.an.groups.includes('c=c')).length;
    const expAll = c4.filter(r => r.an && (r.an.groups.includes('ring') || r.an.groups.includes('c=c'))).length;
    ok('M16 C4H8 候选解析（' + c4.length + ' 项，环 ' + expRing + ' / C=C ' + expCC + '）', c4.length >= 3 && expRing >= 2 && expCC >= 2 && c4.every(r => r.an), { names: c4.map(r => r.an ? r.an.groups.join('+') : 'null') });
    await page.click('#isomer-group-chips .isof-chip[data-scope="g"][data-key="ring"]');
    const r1 = await page.evaluate(() => window.__isomerFilter.rows());
    ok('M17 C4H8 环 chip → ' + expRing + '/' + c4.length,
        r1.filter(r => r.vis).length === expRing && r1.filter(r => r.vis).every(r => r.an.groups.includes('ring')) && r1.filter(r => !r.vis).every(r => !r.an.groups.includes('ring')),
        r1.map(r => (r.vis ? '+' : '-') + r.an.groups.filter(g => g === 'ring' || g === 'c=c').join('+')));
    await page.click('#isomer-group-chips .isof-chip[data-scope="g"][data-key="c=c"]');   // 与环叠加（满足全部）
    const r2 = await page.evaluate(() => window.__isomerFilter.rows());
    ok('M18 环+C=C 全部模式 → 0 行', r2.filter(r => r.vis).length === 0, r2.filter(r => r.vis).length);
    await page.selectOption('#isomer-filter-mode', 'any');
    const r3 = await page.evaluate(() => window.__isomerFilter.rows());
    ok('M19 环或 C=C 任一模式 → ' + expAll + '/' + c4.length, r3.filter(r => r.vis).length === expAll, r3.filter(r => r.vis).length);
    await page.screenshot({ path: 'verify_isomer_filter.png' });
    await page.click('#isomer-filter-reset');
    const r4 = await page.evaluate(() => window.__isomerFilter.rows());
    ok('M20 C4H8 重置全显', r4.every(r => r.vis), r4.filter(r => r.vis).length);

    // M21 筛选后放大界面切换仅在本筛选可见项内（C4H8 环筛选 → 2 项循环，不越界到 5 项）
    await page.click('#isomer-group-chips .isof-chip[data-scope="g"][data-key="ring"]');
    const m21a = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#isomer-list label'));
        return { vis: rows.filter(r => r.style.display !== 'none').length, firstIdx: rows.findIndex(r => r.style.display !== 'none') };
    });
    const m21 = { vis: m21a.vis };
    if (m21a.firstIdx >= 0) {
        const tb = await page.locator('#isomer-list label').nth(m21a.firstIdx).locator('[data-role="skeletal-thumb"]').boundingBox();
        if (tb) {
            await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
            await page.waitForFunction(() => {
                const lb = document.getElementById('skeletal-lightbox');
                const idx = document.getElementById('skeletal-lightbox-index');
                return lb && lb.style.display === 'flex' && idx && idx.textContent === '1 / 2';
            }, null, { timeout: 15000 }).catch(() => {});
            const s1 = await page.evaluate(() => window.__skeletalLightbox.state());
            const nb = await page.locator('#skeletal-lightbox-next').boundingBox();
            let s2 = null;
            if (nb) {
                await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
                await page.waitForTimeout(160);
                s2 = await page.evaluate(() => ({ idx: document.getElementById('skeletal-lightbox-index').textContent, name: window.__skeletalLightbox.state().name }));
            }
            m21.s1 = { idx: s1.indexText, total: s1.total, name: s1.name };
            m21.s2 = s2;
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => document.getElementById('skeletal-lightbox').style.display === 'none', null, { timeout: 8000 }).catch(() => {});
        }
    }
    const ringRowNames = c4.filter(r => r.an && r.an.groups.includes('ring')).map(r => r.name);
    const nameInRing = (nm) => !!nm && ringRowNames.some(t => t.indexOf(nm) >= 0);
    ok('M21 筛选后放大切换仅在本筛选可见项内（' + (m21.s1 ? m21.s1.total : '?') + ' 项循环）',
        !!m21.s1 && m21.s1.idx === '1 / 2' && m21.s1.total === expRing && m21.s1.total === 2 && nameInRing(m21.s1.name)
        && !!m21.s2 && m21.s2.idx === '2 / 2' && nameInRing(m21.s2.name) && m21.s2.name !== m21.s1.name,
        m21);
    await page.click('#isomer-filter-reset');

    // ============ D1 页面 33 例几何自测回归（3 参 waitForFunction） ============
    await page.evaluate(() => { document.getElementById('isomer-panel-close').click(); });
    await page.evaluate(() => { window.lastRunResults = null; setTimeout(() => { try { runAllExamplesAndTests(); } catch (e) {} }, 0); });
    await page.waitForFunction(() => !!window.lastRunResults && Array.isArray(window.lastRunResults.results) && window.lastRunResults.results.length >= 33, null, { timeout: 240000 }).catch(() => {});
    const auto = await page.evaluate(() => {
        const lrr = window.lastRunResults;
        if (!lrr || !Array.isArray(lrr.results)) return null;
        return { n: lrr.results.length, fails: lrr.results.filter(r => !r.pass).map(r => r.example) };
    });
    if (auto) {
        ok('D1 页面 33 例自测全过（' + (auto.n - auto.fails.length) + '/' + auto.n + '）', auto.n >= 33 && auto.fails.length === 0, auto.fails.length ? auto.fails : undefined);
    } else ok('D1 页面自测结果可读', false, { lastRunResults: 'missing' });

    ok('E1 零 console 错误', errs.length === 0, errs.slice(0, 3));
    console.log(results.join('\n'));
    const failed = results.filter(r => r.startsWith('FAIL'));
    console.log(failed.length ? ('RESULT: ' + failed.length + ' FAILED') : 'RESULT: ALL PASS');
    await browser.close();
    process.exit(failed.length ? 1 : 0);
})();
