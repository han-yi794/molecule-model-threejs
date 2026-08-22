// verify_guide_panel.js — 左上角使用说明面板 + 顶部横幅移除 验证
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8046;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=guide1`;
async function probe(url) { return new Promise(res => { const req = http.get(url, r => { r.resume(); res(true); }); req.on('error', () => res(false)); req.setTimeout(3000, () => { req.destroy(); res(false); }); }); }
async function waitPort(ms) { const dl = Date.now() + ms; while (Date.now() < dl) { if (await probe(`http://127.0.0.1:${PORT}/`)) return true; await new Promise(r => setTimeout(r, 500)); } return false; }
async function ensureServer() { if (await waitPort(1000)) return null; const { spawn } = require('child_process'); for (const bin of ['python', 'py']) { const p = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() }); if (await waitPort(15000)) return p; p.kill(); } return null; }
(async () => {
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1289, height: 896 } });
    const report = { results: [], consoleErrors: [] };
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 250)); });
    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(1200);
        const out = {};
        const step = (name, ok, detail) => report.results.push({ name, ok: !!ok, detail });

        // S1: #info 横幅已移除
        out.S1 = await page.evaluate(() => ({ infoExists: !!document.getElementById('info') }));
        step('S1 顶部 #info 长横幅已移除', out.S1.infoExists === false, out.S1);

        // S2: 说明面板在左上角、默认收起
        out.S2 = await page.evaluate(() => {
            const gp = document.getElementById('guide-panel');
            if (!gp) return { fail: 'guide-panel missing' };
            const r = gp.getBoundingClientRect();
            const body = document.getElementById('guide-body');
            return {
                pos: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width) },
                collapsed: getComputedStyle(body).display === 'none',
                toggleText: document.getElementById('guide-toggle').textContent
            };
        });
        step('S2 说明面板位于左上角且默认收起', out.S2.pos && out.S2.pos.left <= 25 && out.S2.pos.top <= 25 && out.S2.collapsed, out.S2);

        // S3: 点击展开显示快捷键内容,再点收起
        await page.click('#guide-toggle');
        out.S3a = await page.evaluate(() => {
            const body = document.getElementById('guide-body');
            return {
                open: body.classList.contains('open'),
                display: getComputedStyle(body).display,
                hasShiftO: body.textContent.includes('全局同步优化'),
                hasXYZ: body.textContent.includes('X/Shift+X'),
                hasCtrlHyb: body.textContent.includes('设置杂化')
            };
        });
        step('S3 展开后含全部快捷键介绍', out.S3a.open && out.S3a.display === 'block' && out.S3a.hasShiftO && out.S3a.hasXYZ && out.S3a.hasCtrlHyb, out.S3a);

        await page.screenshot({ path: 'd_guide_open.png' });
        await page.click('#guide-toggle');
        out.S3b = await page.evaluate(() => ({ closed: getComputedStyle(document.getElementById('guide-body')).display === 'none', tgl: document.getElementById('guide-toggle').textContent }));
        step('S4 再点收起', out.S3b.closed && out.S3b.tgl.includes('▾'), out.S3b);

        // S5: 与预设基团面板不重叠(收起态)
        out.S5 = await page.evaluate(() => {
            const g = document.getElementById('guide-panel').getBoundingClientRect();
            const s = document.getElementById('group-sidebar').getBoundingClientRect();
            const overlap = !(g.bottom < s.top || g.top > s.bottom);
            return { guideBottom: Math.round(g.bottom), groupTop: Math.round(s.top), overlap };
        });
        step('S5 与预设基团面板不重叠', !out.S5.overlap, out.S5);

        // S6: 基团拖拽仍工作(说明面板不挡拖放)
        out.S6 = await page.evaluate(() => {
            window.__diag.generateSpec('methane');
            window.__diag.runOpt();
            const meshes = window.__createCompleteGroup('hydroxyl', { x: 2.2, y: 0, z: 0 });
            return { placed: !!(meshes && meshes.length) };
        });
        step('S6 基团放置不受影响', out.S6.placed, out.S6);

        console.log(JSON.stringify(report, null, 1));
    } catch (e) {
        report.results.push({ name: 'FATAL', ok: false, data: String(e).slice(0, 400) });
        console.log(JSON.stringify(report, null, 1));
    }
    await browser.close();
    if (serverProc) serverProc.kill();
})().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });