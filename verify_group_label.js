// verify_group_label.js — 基团原子标签与其他原子一致
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8039;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=glbl1`;
async function probe(url) { return new Promise(res => { const req = http.get(url, r => { r.resume(); res(true); }); req.on('error', () => res(false)); req.setTimeout(3000, () => { req.destroy(); res(false); }); }); }
async function waitPort(ms) { const dl = Date.now() + ms; while (Date.now() < dl) { if (await probe(`http://127.0.0.1:${PORT}/`)) return true; await new Promise(r => setTimeout(r, 500)); } return false; }
async function ensureServer() { if (await waitPort(1000)) return null; const { spawn } = require('child_process'); for (const bin of ['python', 'py']) { const p = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() }); if (await waitPort(15000)) return p; p.kill(); } return null; }
(async () => {
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const report = { results: [], consoleErrors: [] };
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 250)); });
    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => typeof window.__createCompleteGroup === 'function' && typeof window.__diag === 'object', null, { timeout: 30000 });
        // 等渲染循环把 CSS2D label 挂进 DOM
        await page.waitForTimeout(1500);
        const out = {};
        const step = (name, ok, detail) => report.results.push({ name, ok: !!ok, detail });

        out.S1 = await page.evaluate(() => {
            window.__diag.generateSpec('methane');
            window.__diag.runOpt();
            const meshes = window.__createCompleteGroup('methyl', { x: 3, y: 0, z: 0 });
            if (!meshes || !meshes.length) return { fail: 'not placed' };
            return {
                groupAtoms: meshes.length,
                withLabel: meshes.filter(m => m.userData.label).length,
                texts: meshes.map(m => m.userData.label ? m.userData.label.element.textContent : '(none)')
            };
        });
        step('S1 基团4原子全部带标签', out.S1.withLabel === out.S1.groupAtoms && out.S1.groupAtoms >= 4, out.S1);

        // 等一帧让 labelRenderer 渲染,再从 DOM 统计全部标签文本
        await page.waitForTimeout(800);
        out.S2 = await page.evaluate(() => {
            const divs = [...document.querySelectorAll('div')].filter(d => d.style.pointerEvents === 'none' && d.style.fontSize === '20px');
            return { allTexts: divs.map(d => d.textContent), count: divs.length };
        });
        // 甲烷 C+4H + 甲基 C+3H = 9 标签;全部为纯元素符号(无 (spX) 杂化后缀)
        const cCount = out.S2.allTexts.filter(t => t === 'C').length;
        const hCount = out.S2.allTexts.filter(t => t === 'H').length;
        const noHybSuffix = out.S2.allTexts.every(t => !t.includes('('));
        step('S2 标签共9个(C×2 + H×7),全部无杂化后缀', out.S2.count === 9 && cCount === 2 && hCount === 7 && noHybSuffix, out.S2);

        // S3:优化后标签仍在且保持纯元素符号
        out.S3 = await page.evaluate(() => {
            window.__diag.runOpt();
            const divs = [...document.querySelectorAll('div')].filter(d => d.style.pointerEvents === 'none' && d.style.fontSize === '20px');
            return { afterOpt: divs.map(d => d.textContent).sort() };
        });
        step('S3 优化后标签保留且仍无杂化后缀', out.S3.afterOpt.length === 9 && out.S3.afterOpt.every(t => !t.includes('(')), out.S3);

        await page.screenshot({ path: 'd_glbl.png' });
        console.log(JSON.stringify(report, null, 1));
    } catch (e) {
        report.results.push({ name: 'FATAL', ok: false, data: String(e).slice(0, 400) });
        console.log(JSON.stringify(report, null, 1));
    }
    await browser.close();
    if (serverProc) serverProc.kill();
})().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });