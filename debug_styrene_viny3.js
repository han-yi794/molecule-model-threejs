// debug_styrene_viny3.js — 正确测量 C6/C7 平面偏离(本地 vs PubChem)
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8085;
(async () => {
    const s = await new Promise(r => { const p = require('child_process').spawn('python', ['-m', 'http.server', String(PORT)], { stdio: 'ignore' }); setTimeout(() => r(p), 1500); });
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1289, height: 896 } });
    await page.goto('http://127.0.0.1:' + PORT + '/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=vny3', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2500);

    const out = await page.evaluate(async () => {
        const measure = () => {
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
            // 环外第一个 C: 与环原子直接单键相连的重原子
            let c6 = -1, c7 = -1;
            for (const b of bonds) {
                if (b.type > 1.01 && b.type < 1.99) continue;
                const i1 = ringIds.has(b.pair[0]), i2 = ringIds.has(b.pair[1]);
                if (i1 !== i2 && byId[b.pair[0]].type !== 'H' && byId[b.pair[1]].type !== 'H') {
                    c6 = i1 ? b.pair[1] : b.pair[0];
                }
            }
            if (c6 > -1) {
                const dbl = bonds.find(b => b.type >= 1.9 && b.pair.includes(c6));
                if (dbl) c7 = dbl.pair[0] === c6 ? dbl.pair[1] : dbl.pair[0];
            }
            return { c6: c6 > -1 ? +dist(c6).toFixed(4) : null, c7: c7 > -1 ? +dist(c7).toFixed(4) : null, ring: ringIds.size };
        };
        const res = {};
        await window.__generateFromSmiles('C=Cc1ccccc1');
        res.localGen = measure();
        await window.__diag.runOpt();
        res.localOpt = measure();
        const st = await window.__fetchPubChem3D('smiles', 'C=Cc1ccccc1');
        if (st) { window.__generateFrom3D(st); res.pubchem = measure(); }
        return res;
    });
    console.log(JSON.stringify(out, null, 1));
    await browser.close(); s.kill();
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(1); });