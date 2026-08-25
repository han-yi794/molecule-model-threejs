// debug_styrene_viny2.js — dump bonds 找环外碳
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8084;
(async () => {
    const s = await new Promise(r => { const p = require('child_process').spawn('python', ['-m', 'http.server', String(PORT)], { stdio: 'ignore' }); setTimeout(() => r(p), 1500); });
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1289, height: 896 } });
    await page.goto('http://127.0.0.1:' + PORT + '/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=vny2', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2500);

    const out = await page.evaluate(async () => {
        await window.__generateFromSmiles('C=Cc1ccccc1');
        const bonds = window.__diag.bonds();
        const pos = window.__diag.atomPositions();
        const byId = {}; pos.forEach(p => byId[p.id] = p);
        return {
            atoms: pos.map(p => ({ id: p.id, t: p.type })).slice(0, 20),
            bonds: bonds.map(b => ({ p: b.pair, t: b.type }))
        };
    });
    console.log(JSON.stringify(out, null, 1));
    await browser.close(); s.kill();
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(1); });