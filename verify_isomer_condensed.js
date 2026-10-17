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

    // 2b) 点击缩略图放大查看（2026-10 新增）
    const thumbBox = await page.locator('#isomer-list [data-role="skeletal-thumb"]').first().boundingBox();
    ok('F0 缩略图可定位', !!thumbBox, thumbBox ? { x: Math.round(thumbBox.x), y: Math.round(thumbBox.y) } : null);
    if (thumbBox) {
        const cx = thumbBox.x + thumbBox.width / 2, cy = thumbBox.y + thumbBox.height / 2;
        const cbBefore = await page.evaluate(() => document.querySelectorAll('#isomer-list input[type="checkbox"]:checked').length);
        await page.mouse.click(cx, cy);
        const lbOpen = await page.waitForFunction(() => {
            const lb = document.getElementById('skeletal-lightbox');
            const img = document.getElementById('skeletal-lightbox-img');
            return lb && lb.style.display === 'flex' && img && img.complete && img.naturalWidth > 0 && img.style.visibility === 'visible';
        }, null, { timeout: 30000 }).then(() => true).catch(() => false);
        ok('F1 点击缩略图弹出大图并加载', lbOpen);
        const lbStat = await page.evaluate(() => {
            const img = document.getElementById('skeletal-lightbox-img');
            const cap = document.getElementById('skeletal-lightbox-caption');
            const cbAfter = document.querySelectorAll('#isomer-list input[type="checkbox"]:checked').length;
            const cnt = document.getElementById('isomer-count');
            return { w: img.naturalWidth, h: img.naturalHeight, cap: cap ? cap.textContent : '', checked: cbAfter, count: cnt ? cnt.textContent : '' };
        });
        ok('F2 大图分辨率 ' + lbStat.w + 'x' + lbStat.h + '（>300 即非缩略图）', lbStat.w >= 300);
        ok('F3 图说含名称/分子式/结构简式', lbStat.cap.includes('ethanol') && lbStat.cap.includes('C\u2082H\u2086O') && lbStat.cap.includes('CH\u2083CH\u2082OH'), lbStat.cap);
        ok('F4 点缩略图不改变勾选（前 ' + cbBefore + ' 后 ' + lbStat.checked + '，' + lbStat.count + '）', cbBefore === 0 && lbStat.checked === 0 && /已选 0 个/.test(lbStat.count));
        await page.screenshot({ path: 'verify_isomer_lightbox.png' });
        await page.mouse.click(8, 8);
        const closed1 = await page.waitForFunction(() => document.getElementById('skeletal-lightbox').style.display === 'none', null, { timeout: 6000 }).then(() => true).catch(() => false);
        ok('F5 点暗背景关闭', closed1);
        await page.mouse.click(cx, cy);
        await page.waitForFunction(() => document.getElementById('skeletal-lightbox').style.display === 'flex', null, { timeout: 8000 }).catch(() => {});
        await page.keyboard.press('Escape');
        const closed2 = await page.waitForFunction(() => document.getElementById('skeletal-lightbox').style.display === 'none', null, { timeout: 6000 }).then(() => true).catch(() => false);
        ok('F6 Escape 关闭', closed2);
        await page.mouse.click(cx, cy);
        await page.waitForFunction(() => document.getElementById('skeletal-lightbox').style.display === 'flex', null, { timeout: 8000 }).catch(() => {});
        const closeBox = await page.locator('#skeletal-lightbox-close').boundingBox();
        let closed3 = false;
        if (closeBox) {
            await page.mouse.click(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
            closed3 = await page.waitForFunction(() => document.getElementById('skeletal-lightbox').style.display === 'none', null, { timeout: 6000 }).then(() => true).catch(() => false);
        }
        ok('F7 ✕ 按钮关闭', closed3);
    }

    // 3) 页面 33 例几何自测回归（注意：waitForFunction 的 options 必须放第 3 个参数，
    //    第 2 个参数是 arg——曾把 {timeout} 误传第 2 参导致默认 30s 超时截断 ~40s 的自测）
    await page.evaluate(() => { setTimeout(() => { try { runAllExamplesAndTests(); } catch (e) {} }, 0); });
    await page.waitForFunction(() => !!window.lastRunResults, null, { timeout: 240000 }).catch(() => {});
    const auto = await page.evaluate(() => {
        const lrr = window.lastRunResults;
        if (!lrr || !Array.isArray(lrr.results)) return null;
        return { n: lrr.results.length, fails: lrr.results.filter(r => !r.pass).map(r => r.example), ts: lrr.timestamp };
    });
    if (auto) {
        const passCount = auto.n - auto.fails.length;
        ok('D1 页面 33 例自测全过（' + passCount + '/' + auto.n + '）', auto.n >= 30 && auto.fails.length === 0, auto.fails.length ? auto.fails : undefined);
    } else ok('D1 页面自测结果可读', false, { lastRunResults: 'missing' });

    ok('E1 零 console 错误', errs.length === 0, errs.slice(0, 3));
    console.log(results.join('\n'));
    const failed = results.filter(r => r.startsWith('FAIL'));
    console.log(failed.length ? ('RESULT: ' + failed.length + ' FAILED') : 'RESULT: ALL PASS');
    await browser.close();
    process.exit(failed.length ? 1 : 0);
})();
