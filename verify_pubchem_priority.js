// verify_pubchem_priority.js — 生成优先 PubChem 3D + 断网回退
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8074;
const URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=pchm2`;
async function probe(url) { return new Promise(res => { const req = http.get(url, r => { r.resume(); res(true); }); req.on('error', () => res(false)); req.setTimeout(3000, () => { req.destroy(); res(false); }); }); }
async function waitPort(ms) { const dl = Date.now() + ms; while (Date.now() < dl) { if (await probe(`http://127.0.0.1:${PORT}/`)) return true; await new Promise(r => setTimeout(r, 500)); } return false; }
async function ensureServer() { if (await waitPort(1000)) return null; const { spawn } = require('child_process'); for (const bin of ['python', 'py']) { const p = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() }); if (await waitPort(15000)) return p; p.kill(); } return null; }
(async () => {
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1289, height: 896 } });
    const report = { results: [], consoleErrors: [] };
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 150)); });
    try {
        await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => typeof window.__fetchPubChem3D === 'function' && typeof window.__generateFromInput === 'function', null, { timeout: 30000 });
        await page.waitForTimeout(500);
        const step = (name, ok, detail) => report.results.push({ name, ok: !!ok, detail });
        await page.evaluate(() => {
            window.__MEASURE = () => {
                const pos = window.__diag.atomPositions();
                const bonds = window.__diag.bonds();
                const byId = {}; pos.forEach(p => byId[p.id] = p);
                const aromaticBonds = bonds.filter(b => b.type > 1.01 && b.type < 1.99);
                const ringIds = new Set();
                aromaticBonds.forEach(b => { ringIds.add(b.pair[0]); ringIds.add(b.pair[1]); });
                const ringPos = [...ringIds].map(id => byId[id]).filter(a => a);
                if (ringPos.length < 3) return 999;
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
                return outs.length ? Math.max(...outs) : 999;
            };
        });

        await page.evaluate(() => { if (window.__setInputPanelOpen) window.__setInputPanelOpen(true); });

        // S1: 名称苯甲酸
        await page.fill('#name-input', '');
        await page.fill('#smiles-input', '');
        await page.fill('#name-input', '苯甲酸');
        await page.click('#btn-molecule-from-input');
        await page.waitForFunction(() => window.__diag.atomPositions().length === 15, null, { timeout: 30000 }).catch(() => {});
        const s1 = await page.evaluate(() => ({ d: window.__MEASURE(), n: window.__diag.atomPositions().length }));
        step('S1 名称苯甲酸走PubChem3D(共面<=0.05)', s1.n === 15 && s1.d <= 0.05, s1);

        // S2: 名称苯酚
        await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(true));
        await page.fill('#name-input', '苯酚');
        await page.fill('#smiles-input', '');
        await page.click('#btn-molecule-from-input');
        await page.waitForFunction(() => window.__diag.atomPositions().length === 13, null, { timeout: 30000 }).catch(() => {});
        const s2 = await page.evaluate(() => ({ d: window.__MEASURE(), n: window.__diag.atomPositions().length }));
        step('S2 名称苯酚走PubChem3D(共面<=0.05)', s2.n === 13 && s2.d <= 0.05, s2);

        // S3: 断网回退本地
        await page.route('https://pubchem.ncbi.nlm.nih.gov/**', r => r.abort());
        await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(true));
        await page.fill('#name-input', '苯甲酸');
        await page.fill('#smiles-input', '');
        await page.click('#btn-molecule-from-input');
        await page.waitForFunction(() => window.__diag.atomPositions().length === 15, null, { timeout: 20000 }).catch(() => {});
        const s3 = await page.evaluate(() => ({ n: window.__diag.atomPositions().length }));
        step('S3 断网回退本地仍生成15原子', s3.n === 15, s3);
        await page.unroute('https://pubchem.ncbi.nlm.nih.gov/**');

        // S4: SMILES 输入
        await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(true));
        await page.fill('#name-input', '');
        await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(true));
        await page.fill('#smiles-input', 'OC(=O)c1ccccc1');
        await page.click('#btn-molecule-from-input');
        await page.waitForFunction(() => window.__diag.atomPositions().length === 15, null, { timeout: 30000 }).catch(() => {});
        const s4 = await page.evaluate(() => ({ d: window.__MEASURE(), n: window.__diag.atomPositions().length }));
        step('S4 SMILES输入走PubChem3D(共面<=0.05)', s4.n === 15 && s4.d <= 0.05, s4);

        console.log(JSON.stringify(report, null, 1));
    } catch (e) {
        report.results.push({ name: 'FATAL', ok: false, detail: String(e).slice(0, 300) });
        console.log(JSON.stringify(report, null, 1));
    }
    await browser.close();
    if (serverProc) serverProc.kill();
})().catch(e => { console.error('FATAL', String(e).slice(0, 300)); process.exit(1); });