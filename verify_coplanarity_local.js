// verify_coplanarity_local.js — 本地管线一次优化后的共面性
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8078;
(async () => {
    const s = await new Promise(r => { const p = require('child_process').spawn('python', ['-m', 'http.server', String(PORT)], { stdio: 'ignore' }); setTimeout(() => r(p), 1500); });
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1289, height: 896 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 150)));
    await page.goto('http://127.0.0.1:' + PORT + '/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=cl', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof window.__generateFromSmiles === 'function', null, { timeout: 30000 });
    await page.waitForTimeout(500);

    const out = await page.evaluate(async () => {
        const results = {};
        const SMILES = [
            ['styrene', 'C=Cc1ccccc1'],
            ['benzoic acid', 'OC(=O)c1ccccc1'],
            ['phenol', 'Oc1ccccc1'],
            ['cinnamic acid', 'OC(=O)C=Cc1ccccc1'],
            ['biphenyl', 'c1ccccc1-c2ccccc2']
        ];
        for (const [name, smi] of SMILES) {
            const r = await window.__generateFromSmiles(smi);
            if (!r || !r.ok) { results[name] = { fail: 'gen' }; continue; }
            // 测量: 所有非H取代基到任一芳香环平面的最大距离
            const pos = window.__diag.atomPositions();
            const bonds = window.__diag.bonds();
            const byId = {}; pos.forEach(p => byId[p.id] = p);
            const aromaticBonds = bonds.filter(b => b.type > 1.01 && b.type < 1.99);
            const ringIds = new Set();
            aromaticBonds.forEach(b => { ringIds.add(b.pair[0]); ringIds.add(b.pair[1]); });
            const ringPos = [...ringIds].map(id => byId[id]).filter(a => a);
            if (ringPos.length < 3) { results[name] = { fail: 'no ring', n: pos.length }; continue; }
            const v1 = { x: ringPos[1].x - ringPos[0].x, y: ringPos[1].y - ringPos[0].y, z: ringPos[1].z - ringPos[0].z };
            const v2 = { x: ringPos[2].x - ringPos[0].x, y: ringPos[2].y - ringPos[0].y, z: ringPos[2].z - ringPos[0].z };
            const n = { x: v1.y * v2.z - v1.z * v2.y, y: v1.z * v2.x - v1.x * v2.z, z: v1.x * v2.y - v1.y * v2.x };
            const nL = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z); n.x /= nL; n.y /= nL; n.z /= nL;
            let cx = 0, cy = 0, cz = 0; for (const p of ringPos) { cx += p.x; cy += p.y; cz += p.z; }
            cx /= ringPos.length; cy /= ringPos.length; cz /= ringPos.length;
            const outs = [];
            for (const id of ringIds) for (const b of bonds) {
                if (b.pair.includes(id)) {
                    const o = b.pair[0] === id ? b.pair[1] : b.pair[0];
                    if (!ringIds.has(o) && byId[o] && byId[o].type !== 'H') {
                        const p = byId[o];
                        outs.push(Math.abs((p.x - cx) * n.x + (p.y - cy) * n.y + (p.z - cz) * n.z));
                    }
                }
            }
            results[name] = { maxSubDist: outs.length ? +(Math.max(...outs).toFixed(4)) : 0, replacedAtoms: pos.length };
        }
        return results;
    });
    console.log(JSON.stringify({ out, errs }, null, 1));
    await browser.close(); s.kill();
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(1); });