const { chromium } = require('playwright');
const http = require('http');
const PORT = 8080;
(async () => {
    const s = await new Promise(r => { const p = require('child_process').spawn('python', ['-m', 'http.server', String(PORT)], { stdio: 'ignore' }); setTimeout(() => r(p), 1500); });
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1289, height: 896 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
    await page.goto('http://127.0.0.1:' + PORT + '/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=sty6', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { if (window.__setInputPanelOpen) window.__setInputPanelOpen(true); });
    const out = await page.evaluate(async () => {
        window.__setInputPanelOpen && window.__setInputPanelOpen(true);
        document.getElementById('name-input').value = '';
        document.getElementById('smiles-input').value = 'C=Cc1ccccc1';
        await window.__generateFromInput();
        const pos = window.__diag.atomPositions();
        const bonds = window.__diag.bonds();
        const byId = {}; pos.forEach(p => byId[p.id] = p);
        const aromaticBonds = bonds.filter(b => b.type > 1.01 && b.type < 1.99);
        const ringIds = new Set();
        aromaticBonds.forEach(b => { ringIds.add(b.pair[0]); ringIds.add(b.pair[1]); });
        const ringPos = [...ringIds].map(id => byId[id]).filter(a => a);
        const v1 = { x: ringPos[1].x - ringPos[0].x, y: ringPos[1].y - ringPos[0].y, z: ringPos[1].z - ringPos[0].z };
        const v2 = { x: ringPos[2].x - ringPos[0].x, y: ringPos[2].y - ringPos[0].y, z: ringPos[2].z - ringPos[0].z };
        const n = { x: v1.y * v2.z - v1.z * v2.y, y: v1.z * v2.x - v1.x * v2.z, z: v1.x * v2.y - v1.y * v2.x };
        const nL = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z); n.x /= nL; n.y /= nL; n.z /= nL;
        let cx = 0, cy = 0, cz = 0; for (const p of ringPos) { cx += p.x; cy += p.y; cz += p.z; }
        cx /= ringPos.length; cy /= ringPos.length; cz /= ringPos.length;
        const dist = (id) => { const p = byId[id]; if (!p) return 999; return (p.x - cx) * n.x + (p.y - cy) * n.y + (p.z - cz) * n.z; };
        const outers = [];
        for (const id of ringIds) for (const b of bonds) {
            if (b.pair.includes(id)) {
                const o = b.pair[0] === id ? b.pair[1] : b.pair[0];
                if (!ringIds.has(o) && byId[o] && byId[o].type !== 'H' && !outers.some(nn => nn.id === o)) {
                    outers.push({ id: o, t: byId[o].type, d: +dist(o).toFixed(4) });
                }
            }
        }
        return { n: pos.length, outers, allDist: pos.filter(p => p.type !== 'H').map(p => ({ id: p.id, t: p.type, d: +dist(p.id).toFixed(3) })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 8) };
    });
    console.log(JSON.stringify({ out, errs }, null, 1));
    await browser.close(); s.kill();
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(1); });
