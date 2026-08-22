// verify_no_group_name_label.js — 拖拽预览不再显示基团名称独立标签(如 COOR)
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8040;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=gpnl1`;
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
        // 先生成苯(有可键合原子)
        await page.evaluate(() => { window.__diag.generateSpec('benzene'); window.__diag.runOpt(); });
        await page.waitForTimeout(1200);
        const out = {};
        const step = (name, ok, detail) => report.results.push({ name, ok: !!ok, detail });

        // 真实鼠标:从 COOR 卡片按下拖到画布中央
        const card = await page.locator('#drag-group-ester').boundingBox();
        const canvas = await page.locator('canvas').boundingBox();
        const startX = card.x + card.width / 2, startY = card.y + card.height / 2;
        const endX = canvas.x + canvas.width / 2, endY = canvas.y + canvas.height / 2;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move((startX + endX) / 2, (startY + endY) / 2, { steps: 8 });
        await page.mouse.move(endX, endY, { steps: 8 });
        await page.waitForTimeout(400); // 等预览与 labelRenderer 渲染
        out.dragging = await page.evaluate(() => {
            const divs = [...document.querySelectorAll('div')];
            // 预览标签特征:fontSize 15px + pointerEvents none
            const previewLabels = divs.filter(d => d.style.pointerEvents === 'none' && d.style.fontSize === '15px').map(d => d.textContent);
            // 全 DOM 中是否还有 "COOR" 文本节点出现在画布覆盖层(labelRenderer 容器)内
            return { previewLabels };
        });
        step('拖拽中无 COOR 名称标签', (out.dragging.previewLabels || []).length === 0, out.dragging);

        // 松手放置
        await page.mouse.up();
        await page.waitForTimeout(800);
        out.dropped = await page.evaluate(() => {
            const divs = [...document.querySelectorAll('div')];
            const previewLabels = divs.filter(d => d.style.pointerEvents === 'none' && d.style.fontSize === '15px').map(d => d.textContent);
            const atomLabels = divs.filter(d => d.style.pointerEvents === 'none' && d.style.fontSize === '20px').map(d => d.textContent);
            const pos = window.__diag.atomPositions();
            return {
                previewLabels,
                atomLabels,
                esterAtomsAdded: pos.filter(a => ['O'].includes(a.type)).length,
                totalAtoms: pos.length
            };
        });
        // 苯 12 原子 + 酯基(COOR= C+2O+? GROUP_SPECS.ester atoms 数不定,只查 O 增加 ≥2 与无 15px 标签)
        step('放置成功且无名称残留标签', (out.dropped.previewLabels || []).length === 0 && out.dropped.totalAtoms > 12 && out.dropped.esterAtomsAdded >= 2, out.dropped);

        await page.screenshot({ path: 'd_gpnl.png' });
        console.log(JSON.stringify(report, null, 1));
    } catch (e) {
        report.results.push({ name: 'FATAL', ok: false, data: String(e).slice(0, 400) });
        console.log(JSON.stringify(report, null, 1));
    }
    await browser.close();
    if (serverProc) serverProc.kill();
})().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });