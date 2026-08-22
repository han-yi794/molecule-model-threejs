// verify_ui_clear_help2.js — × 按钮垂直居中 + 帮助显示完整 修复验证
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8031;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=uiclr2`;
async function probe(url) { return new Promise(res => { const req = http.get(url, r => { r.resume(); res(true); }); req.on('error', () => res(false)); req.setTimeout(3000, () => { req.destroy(); res(false); }); }); }
async function waitPort(ms) { const dl = Date.now() + ms; while (Date.now() < dl) { if (await probe(`http://127.0.0.1:${PORT}/`)) return true; await new Promise(r => setTimeout(r, 500)); } return false; }
async function ensureServer() { if (await waitPort(1000)) return null; const { spawn } = require('child_process'); for (const bin of ['python', 'py']) { const p = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() }); if (await waitPort(15000)) return p; p.kill(); } return null; }
(async () => {
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const report = { results: [], consoleErrors: [] };
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => typeof window.__syncInputClearButtons === 'function', null, { timeout: 30000 });
        const out = { steps: [] };
        const step = (name, ok, detail) => out.steps.push({ name, ok: !!ok, detail });

        // 1. × 按钮垂直居中：先填内容让按钮显示，按钮中心 y 应约等于 input 中心 y（误差 < 4px）
        await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(true));
        await page.fill('#smiles-input', 'CCO');
        await page.waitForTimeout(100);
        const geom = await page.evaluate(() => {
            const input = document.getElementById('smiles-input');
            const wrap = input.closest('.input-wrap');
            const btn = wrap.querySelector('.clear-btn');
            const ir = input.getBoundingClientRect();
            const br = btn.getBoundingClientRect();
            return {
                inputCy: ir.top + ir.height / 2,
                btnCy: br.top + br.height / 2,
                delta: (ir.top + ir.height / 2) - (br.top + br.height / 2),
                btnSize: br.height,
                btnDisplay: getComputedStyle(btn).display,
                inputPadRight: getComputedStyle(input).paddingRight
            };
        });
        step('× 按钮垂直居中(delta<4px)', geom.btnDisplay === 'block' && Math.abs(geom.delta) < 4, geom);

        // 2. 展开帮助：帮助框自身可滚动到完整内容（max-height 46vh），侧栏不被撑爆
        await page.click('#smiles-help-toggle');
        const scrollInfo = await page.evaluate(() => {
            const sb = document.getElementById('sidebar');
            const box = document.getElementById('smiles-help');
            // 帮助框滚动到底
            box.scrollTop = box.scrollHeight;
            const lastCode = box.querySelector('code:last-of-type');
            const lr = lastCode ? lastCode.getBoundingClientRect() : null;
            const br = box.getBoundingClientRect();
            // 完整内容是否能在帮助框内滚动到
            const boxScrollable = box.scrollHeight > box.clientHeight;
            const lastVisible = lr ? (lr.bottom <= br.bottom + 2) : false;
            // 帮助框高度受限于 46vh（800 视口 → ≤368px），不能无限撑爆侧栏
            const bounded = box.clientHeight <= 400;
            return {
                boxScrollable, lastVisible, bounded, boxScrollHeight: box.scrollHeight, boxClientHeight: box.clientHeight,
                sbOverflowBefore: sb.scrollHeight - sb.clientHeight,
                horizOverflow: false
            };
        });
        step('帮助框自身滚动到完整内容(末行可见)', scrollInfo.boxScrollable && scrollInfo.lastVisible && scrollInfo.bounded, scrollInfo);

        // 3. 帮助框内部滚动：内容高度 > 可视高度（可滚动），非被压缩
        const h2 = await page.evaluate(() => {
            const box = document.getElementById('smiles-help');
            return { clientH: box.clientHeight, scrollH: box.scrollHeight, display: getComputedStyle(box).display };
        });
        step('帮助框内部滚动(内容>可视)', h2.display === 'block' && h2.scrollH > h2.clientH, h2);

        // 4. 长 SMILES 示例折行无横向溢出
        const codeGeom = await page.evaluate(() => {
            const sb = document.getElementById('sidebar');
            const box = document.getElementById('smiles-help');
            let worst = 0;
            box.querySelectorAll('code').forEach(c => {
                const r = c.getBoundingClientRect();
                const over = r.right - sb.getBoundingClientRect().right;
                if (over > worst) worst = over;
            });
            return { worstRightOverflow: +worst.toFixed(1) };
        });
        step('长 SMILES 示例无横向溢出(≤1px)', codeGeom.worstRightOverflow <= 1, codeGeom);

        // 5. 收起后恢复（滚动到 toggle 可见再点，防滚动位置影响点击）
        await page.evaluate(() => document.getElementById('smiles-help-toggle').scrollIntoView({ block: 'center' }));
        await page.waitForTimeout(100);
        await page.click('#smiles-help-toggle');
        const closed = await page.evaluate(() => ({ open: document.getElementById('smiles-help').classList.contains('open'), display: getComputedStyle(document.getElementById('smiles-help')).display }));
        step('帮助可收起', closed.open === false && closed.display === 'none', closed);

        report.results.push({ name: 'ui-clear-help2', data: out });
    } catch (e) { report.results.push({ name: 'FATAL', data: String(e).slice(0, 400) }); }
    await browser.close();
    if (serverProc) serverProc.kill();
    console.log(JSON.stringify(report, null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });