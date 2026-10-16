// 异构体面板：结构简式 + 键线式缩略图 验证（2026-10）
const { chromium } = require('playwright');
(async () => {
    const results = [];
    const ok = (name, cond, extra) => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.goto('http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html');
    await page.waitForFunction(() => window.__smilesToCondensed && window.__setInputPanelOpen, { timeout: 30000 });
    // 4.html 的 AUTO_RUN_ALL_TESTS=false → 手动触发几何自测（后台跑，最后收结果）
    await page.evaluate(() => { setTimeout(() => { try { runAllExamplesAndTests(); } catch (e) {} }, 0); });

    // 1) 函数电池（页面内）
    const battery = [
        ['CCO', 'CH3CH2OH'], ['COC', 'CH3OCH3'], ['CC(=O)O', 'CH3COOH'], ['COC=O', 'CH3OCHO'],
        ['C=O', 'HCHO'], ['CC#N', 'CH3CN'], ['c1ccccc1', 'C6H6'], ['C1=CC=CC=C1', 'C6H6'],
        ['Cc1ccccc1', 'C6H5CH3'], ['C=Cc1ccccc1', 'C6H5CH=CH2'], ['OCCO', 'HOCH2CH2OH'],
        ['CC(=O)Oc1ccccc1', 'C6H5OCOCH3'], ['CN(=O)=O', 'CH3NO2'], ['CC(C)(C)C', 'CH3C(CH3)2CH3'],
        ['c1ccncc1', null], ['C1CCCCC1', null],
    ];
    const bat = await page.evaluate((cases) => {
        return cases.map(([smi, exp]) => {
            let got = null;
            try { got = window.__smilesToCondensed(smi); } catch (e) { got = 'THREW:' + e.message; }
            return { smi, exp, got, ok: got === exp };
        });
    }, battery);
    const badBat = bat.filter(b => !b.ok);
    ok('B1 转换器电池 ' + (battery.length - badBat.length) + '/' + battery.length, badBat.length === 0, badBat.slice(0, 4));

    const sub = await page.evaluate(() => window.__toSubscriptCondensed('CH3CH(CH3)2'));
    ok('B2 展示下标化 (CH3)2', sub === 'CH\u2083CH(CH\u2083)\u2082', sub);

    // 2) 真实流程：C2H6O → 面板
    await page.evaluate(() => window.__setInputPanelOpen(true));
    await page.fill('#formula-input', 'C2H6O');
    await page.press('#formula-input', 'Enter');
    await page.waitForFunction(() => {
        const p = document.getElementById('isomer-panel');
        return p && p.style.display === 'flex';
    }, { timeout: 40000 });
    await page.waitForFunction(() => {
        const imgs = Array.from(document.querySelectorAll('#isomer-list img'));
        return imgs.length >= 2 && imgs.every(i => i.complete && i.naturalWidth > 0);
    }, { timeout: 30000 }).catch(() => {});
    const stat = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#isomer-list label'));
        const texts = rows.map(r => r.textContent);
        const imgs = Array.from(document.querySelectorAll('#isomer-list img'));
        const condSpans = Array.from(document.querySelectorAll('#isomer-list span[style*="255, 210, 138"]')).map(s => s.textContent);
        return {
            rows: rows.length,
            texts: texts,
            condSpans: condSpans,
            imgs: imgs.length,
            loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length,
        };
    });
    ok('C1 行数=2（乙醇/甲醚）', stat.rows === 2, stat.rows);
    const joined = stat.texts.join(' | ');
    ok('C2 行含下标结构简式 CH₃CH₂OH', joined.includes('CH\u2083CH\u2082OH'), stat.condSpans);
    ok('C3 行含下标结构简式 CH₃OCH₃', joined.includes('CH\u2083OCH\u2083'));
    ok('C4 行含下标分子式 C₂H₆O', joined.includes('C\u2082H\u2086O'));
    ok('C5 键线式缩略图 2/2 加载', stat.imgs === 2 && stat.loaded === 2, { imgs: stat.imgs, loaded: stat.loaded });

    await page.screenshot({ path: 'verify_isomer_condensed.png' });

    // 3) 页面 33 例几何自测回归
    const auto = await page.waitForFunction(() => window.lastRunResults, { timeout: 240000 }).then(h => h.jsonValue()).catch(() => null);
    if (auto) {
        const list = auto.results || [];
        const failCount = list.filter(r => !r.pass).length;
        ok('D1 页面 33 例自测全过（' + (list.length - failCount) + '/' + list.length + '）', list.length >= 30 && failCount === 0);
    } else ok('D1 页面自测结果可读', false);

    ok('E1 零 console 错误', errs.length === 0, errs.slice(0, 3));
    console.log(results.join('\n'));
    const failed = results.filter(r => r.startsWith('FAIL'));
    console.log(failed.length ? ('RESULT: ' + failed.length + ' FAILED') : 'RESULT: ALL PASS');
    await browser.close();
    process.exit(failed.length ? 1 : 0);
})();
