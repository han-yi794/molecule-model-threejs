const { chromium } = require('playwright-core');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const report = { reg4: null, reg2: null, reg3: null };
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

    // 4 鍙凤細33 鍑犱綍 + 23 pi锛堟樉寮忚皟鐢級
    await page.goto('http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    const g = await page.evaluate(async () => {
        const out = {};
        try {
            const res = await window.runAllExamplesAndTests();
            const lr = window.lastRunResults;
            out.geom = {
                total: lr && lr.results ? lr.results.length : null,
                passed: lr && lr.results ? lr.results.filter(r => r && r.pass).length : null,
                fails: lr && lr.results ? lr.results.filter(r => r && !r.pass).map(r => ({ name: r.example, msg: String(r.msg || r.error || (r.details ? JSON.stringify(r.details).slice(0, 200) : '')).slice(0, 300) })) : [],
                raw: typeof res === 'string' ? res.slice(0, 300) : JSON.stringify(res).slice(0, 300)
            };
        } catch (e) { out.geom = { error: String(e).slice(0, 300) }; }
        try {
            await window.__runPiSystemTests();
            const pr = JSON.parse(localStorage.getItem('PI_TEST_REPORT') || '{}');
            out.pi = {
                total: pr.summary ? pr.summary.length : null,
                passed: pr.summary ? pr.summary.filter(s => s.pass).length : null,
                fails: pr.summary ? pr.summary.filter(s => !s.pass).map(s => s.key) : []
            };
        } catch (e) { out.pi = { error: String(e).slice(0, 300) }; }
        return out;
    });
    report.reg4 = g;

    // 2 鍙凤細鑷姩娴嬭瘯锛堜笉鍔?noauto锛岀瓑 AUTO锛?    await page.goto('http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B2.html', { waitUntil: 'networkidle', timeout: 60000 });
    for (let i = 0; i < 60; i++) {
        const done = await page.evaluate(() => window.__AUTOTEST_DONE__ || false).catch(() => false);
        if (done) break;
        await page.waitForTimeout(2000);
    }
    report.reg2 = await page.evaluate(() => {
        const lr = window.lastRunResults;
        return {
            done: !!window.__AUTOTEST_DONE__,
            total: lr && lr.results ? lr.results.length : null,
            passed: lr && lr.results ? lr.results.filter(r => r && r.pass).length : null,
            fails: lr && lr.results ? lr.results.filter(r => r && !r.pass).map(r => ({ name: r.example, msg: String(r.msg || r.error || '').slice(0, 200) })) : []
        };
    });

    // 3 鍙凤細pi 鍥炲綊
    await page.goto('http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B3.html?noauto=1', { waitUntil: 'networkidle', timeout: 60000 });
    const p3 = await page.evaluate(async () => {
        try { await window.__runPiSystemTests(); } catch (e) { return { error: String(e).slice(0, 300) }; }
        const pr = JSON.parse(localStorage.getItem('PI_TEST_REPORT') || '{}');
        return {
            total: pr.summary ? pr.summary.length : null,
            passed: pr.summary ? pr.summary.filter(s => s.pass).length : null,
            fails: pr.summary ? pr.summary.filter(s => !s.pass).map(s => s.key) : []
        };
    });
    report.reg3 = p3;
    report.errors = errors.slice(0, 10);

    await browser.close();
    console.log(JSON.stringify(report, null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
