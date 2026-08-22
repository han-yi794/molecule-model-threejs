// verify_ghost_bond.js — 取代氢后清空场景,断言无残留键网格(scene.children 回基线)
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8037;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=ghost2`;
async function probe(url) { return new Promise(res => { const req = http.get(url, r => { r.resume(); res(true); }); req.on('error', () => res(false)); req.setTimeout(3000, () => { req.destroy(); res(false); }); }); }
async function waitPort(ms) { const dl = Date.now() + ms; while (Date.now() < dl) { if (await probe(`http://127.0.0.1:${PORT}/`)) return true; await new Promise(r => setTimeout(r, 500)); } return false; }
async function ensureServer() { if (await waitPort(1000)) return null; const { spawn } = require('child_process'); for (const bin of ['python', 'py']) { const p = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() }); if (await waitPort(15000)) return p; p.kill(); } return null; }
(async () => {
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const report = { results: [], consoleErrors: [] };
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 400)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => typeof window.__createCompleteGroup === 'function' && typeof window.__diag.sceneStats === 'function', null, { timeout: 30000 });
        const out = {};
        const step = (name, ok, detail) => report.results.push({ name, ok: !!ok, detail });

        // 基线:空场景(先清一次拿稳定基线)
        const baseline = await page.evaluate(() => {
            document.getElementById('btn-clear-molecule').click();
            return window.__diag.sceneStats().total;
        });

        // 场景1:苯 + 羧基(取代 1 个环 H)→ 清空 → scene.children 应回基线
        out.S1 = await page.evaluate((baseline) => {
            window.__diag.generateSpec('benzene');
            window.__diag.runOpt();
            const beforeGen = window.__diag.sceneStats().total;
            const meshes = window.__createCompleteGroup('carboxyl', { x: 2.4, y: 0, z: 0 });
            if (!meshes || !meshes.length) return { fail: 'not placed' };
            const afterPlace = window.__diag.sceneStats().total;
            document.getElementById('btn-clear-molecule').click();
            const afterClear = window.__diag.sceneStats();
            return {
                baseline, beforeGen, afterPlace,
                afterClearTotal: afterClear.total,
                residual: afterClear.total - baseline,
                atomsLeft: window.__diag.atomPositions().length,
                bondsLeft: window.__diag.bonds().length
            };
        }, baseline);
        step('S1 取代+清空后 scene 回基线(无幽灵键)', out.S1.residual === 0 && out.S1.atomsLeft === 0 && out.S1.bondsLeft === 0, out.S1);

        // 场景2:三轮"生成→取代→清空",残留不得累积
        out.S2 = await page.evaluate((baseline) => {
            for (let k = 0; k < 3; k++) {
                window.__diag.generateSpec('benzene');
                window.__diag.runOpt();
                window.__createCompleteGroup('methyl', { x: 2.4 - k * 0.2, y: 0.1 * k, z: 0 });
                document.getElementById('btn-clear-molecule').click();
            }
            const st = window.__diag.sceneStats();
            return { residual: st.total - baseline, atomsLeft: window.__diag.atomPositions().length };
        }, baseline);
        step('S2 三轮取代+清零无累积残留', out.S2.residual === 0 && out.S2.atomsLeft === 0, out.S2);

        // 场景3:清空后再生成正常分子(管线未被破坏)
        out.S3 = await page.evaluate(() => {
            window.__diag.generateSpec('ethane');
            window.__diag.runOpt();
            const pos = window.__diag.atomPositions();
            return { atoms: pos.length, C: pos.filter(a => a.type === 'C').length, H: pos.filter(a => a.type === 'H').length };
        });
        step('S3 清空后乙烷正常(8原子 C2H6)', out.S3.atoms === 8 && out.S3.C === 2 && out.S3.H === 6, out.S3);

        console.log(JSON.stringify({ baseline, ...report }, null, 1));
    } catch (e) {
        report.results.push({ name: 'FATAL', ok: false, data: String(e).slice(0, 400) });
        console.log(JSON.stringify(report, null, 1));
    }
    await browser.close();
    if (serverProc) serverProc.kill();
})().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });