// verify_src_log.js — 验证控制台来源提示
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8079;
(async () => {
    const s = await new Promise(r => { const p = require('child_process').spawn('python', ['-m', 'http.server', String(PORT)], { stdio: 'ignore' }); setTimeout(() => r(p), 1500); });
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1289, height: 896 } });
    const logs = [];
    page.on('console', m => { const t = m.text(); if (t.includes('[分子来源]')) logs.push(t); });
    await page.goto('http://127.0.0.1:' + PORT + '/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=log', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof window.__generateFromInput === 'function', null, { timeout: 30000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => { if (window.__setInputPanelOpen) window.__setInputPanelOpen(true); });

    // 1. 名称路径
    await page.fill('#name-input', '苯甲酸');
    await page.fill('#smiles-input', '');
    await page.click('#btn-molecule-from-input');
    await page.waitForFunction(() => window.__diag.atomPositions().length === 15, null, { timeout: 30000 }).catch(() => {});

    // 2. SMILES 路径
    await page.evaluate(() => { if (window.__setInputPanelOpen) window.__setInputPanelOpen(true); });
    await page.fill('#name-input', '');
    await page.fill('#smiles-input', 'C=Cc1ccccc1');
    await page.click('#btn-molecule-from-input');
    await page.waitForFunction(() => window.__diag.atomPositions().length === 16, null, { timeout: 30000 }).catch(() => {});

    // 3. 断网回退: 拦截 PubChem → 应显示"本地管线"
    await page.route('https://pubchem.ncbi.nlm.nih.gov/**', r => r.abort());
    await page.evaluate(() => { if (window.__setInputPanelOpen) window.__setInputPanelOpen(true); });
    await page.fill('#name-input', '苯酚');
    await page.fill('#smiles-input', '');
    await page.click('#btn-molecule-from-input');
    await page.waitForFunction(() => window.__diag.atomPositions().length === 13, null, { timeout: 20000 }).catch(() => {});
    await page.unroute('https://pubchem.ncbi.nlm.nih.gov/**');

    console.log(JSON.stringify({ logs }, null, 1));
    await browser.close(); s.kill();
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(1); });