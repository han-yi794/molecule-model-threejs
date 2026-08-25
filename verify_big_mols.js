// verify_big_mols.js — 大分子中文名解析验证
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8088;
(async () => {
    const s = await new Promise(r => { const p = require('child_process').spawn('python', ['-m', 'http.server', String(PORT)], { stdio: 'ignore' }); setTimeout(() => r(p), 1500); });
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1289, height: 896 } });
    await page.goto('http://127.0.0.1:' + PORT + '/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=big2', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => typeof window.__translateZhToEn === 'function', null, { timeout: 30000 });
    await page.waitForTimeout(500);

    const out = await page.evaluate(async () => {
        const res = { translate: {}, resolve: {} };
        // 1. 翻译/修正表
        for (const n of ['血红素', '胰岛素', '叶绿素', '胆固醇', '葡萄糖', '咖啡因']) {
            res.translate[n] = await window.__translateZhToEn(n);
        }
        // 2. 名称解析全链路
        for (const n of ['血红素', '胰岛素', '叶绿素', '胆固醇', '葡萄糖']) {
            try {
                const r = await window.__resolveNameToSmiles(n);
                res.resolve[n] = { error: r && r.error, smilesLen: r && r.smiles ? r.smiles.length : 0, cid: r && r.cid, cands: r && r.candidates ? r.candidates.length : undefined };
            } catch (e) { res.resolve[n] = { err: String(e).slice(0, 100) }; }
        }
        return res;
    });
    console.log(JSON.stringify(out, null, 1));
    await browser.close(); s.kill();
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(1); });