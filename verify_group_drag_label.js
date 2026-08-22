// verify_group_drag_label.js — 拖拽中显示基团名称标签(如 COOR),松手后立即消失,原子为纯元素符号
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8040;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=gdl1`;
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
        await page.evaluate(() => { window.__diag.generateSpec('benzene'); window.__diag.runOpt(); });
        await page.waitForTimeout(1200);
        const out = {};
        const step = (name, ok, detail) => report.results.push({ name, ok: !!ok, detail });

        // 真实鼠标:从 COOR 卡片拖到画布
        const card = await page.locator('#drag-group-ester').boundingBox();
        const canvas = await page.locator('canvas').boundingBox();
        const startX = card.x + card.width / 2, startY = card.y + card.height / 2;
        const endX = canvas.x + canvas.width / 2, endY = canvas.y + canvas.height / 2;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move((startX + endX) / 2, (startY + endY) / 2, { steps: 8 });
        await page.mouse.move(endX, endY, { steps: 8 });
        await page.waitForTimeout(400);
        out.dragging = await page.evaluate(() => {
            const divs = [...document.querySelectorAll('div')];
            // 预览名称标签特征:fontSize 15px + pointerEvents none
            const previewLabels = divs.filter(d => d.style.pointerEvents === 'none' && d.style.fontSize === '15px').map(d => d.textContent);
            return { previewLabels };
        });
        step('拖拽中显示 COOR 基团标签', (out.dragging.previewLabels || []).includes('COOR'), out.dragging);

        // 松手后尽快检查(约 2 帧):标签立即消失
        await page.mouse.up();
        await page.waitForTimeout(200);
        out.droppedFast = await page.evaluate(() => {
            const divs = [...document.querySelectorAll('div')];
            const previewLabels = divs.filter(d => d.style.pointerEvents === 'none' && d.style.fontSize === '15px').map(d => d.textContent);
            return { previewLabels };
        });
        step('松手后约2帧内基团标签立即消失', (out.droppedFast.previewLabels || []).length === 0, out.droppedFast);

        // 放置结果:原子全部纯元素符号、酯基成功放置
        await page.waitForTimeout(600);
        out.dropped = await page.evaluate(() => {
            const divs = [...document.querySelectorAll('div')];
            const previewLabels = divs.filter(d => d.style.pointerEvents === 'none' && d.style.fontSize === '15px').map(d => d.textContent);
            const atomLabels = divs.filter(d => d.style.pointerEvents === 'none' && d.style.fontSize === '20px').map(d => d.textContent);
            const pos = window.__diag.atomPositions();
            return {
                previewLabels,
                atomLabels,
                totalAtoms: pos.length,
                oCount: pos.filter(a => a.type === 'O').length
            };
        });
        step('放置成功且原子全为纯元素符号', out.dropped.totalAtoms > 12 && out.dropped.oCount >= 2 && out.dropped.atomLabels.every(t => !t.includes('(')) && (out.dropped.previewLabels || []).length === 0, out.dropped);

        // 场景2:拖拽中途按 Esc/移回侧栏取消 → 标签也消失且不放置
        const card2 = await page.locator('#drag-group-carbonyl').boundingBox();
        await page.mouse.move(card2.x + card2.width / 2, card2.y + card2.height / 2);
        await page.mouse.down();
        await page.mouse.move(canvas.x + canvas.width * 0.6, canvas.y + canvas.height * 0.4, { steps: 6 });
        await page.waitForTimeout(300);
        out.dragC = await page.evaluate(() => {
            const divs = [...document.querySelectorAll('div')];
            return { previewLabels: divs.filter(d => d.style.pointerEvents === 'none' && d.style.fontSize === '15px').map(d => d.textContent) };
        });
        step('羰基拖拽中显示 C=O 标签', (out.dragC.previewLabels || []).includes('C=O'), out.dragC);
        // 移回侧栏取消拖拽
        await page.mouse.move(card2.x + card2.width / 2, card2.y + card2.height / 2, { steps: 6 });
        await page.mouse.up();
        await page.waitForTimeout(200);
        out.cancelled = await page.evaluate(() => {
            const divs = [...document.querySelectorAll('div')];
            const previewLabels = divs.filter(d => d.style.pointerEvents === 'none' && d.style.fontSize === '15px').map(d => d.textContent);
            const pos = window.__diag.atomPositions();
            return { previewLabels, atomsAfter: pos.length };
        });
        step('取消拖拽后标签消失且未放置原子', (out.cancelled.previewLabels || []).length === 0 && out.cancelled.atomsAfter === out.dropped.totalAtoms, out.cancelled);

        await page.screenshot({ path: 'd_gdl.png' });
        console.log(JSON.stringify(report, null, 1));
    } catch (e) {
        report.results.push({ name: 'FATAL', ok: false, data: String(e).slice(0, 400) });
        console.log(JSON.stringify(report, null, 1));
    }
    await browser.close();
    if (serverProc) serverProc.kill();
})().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });