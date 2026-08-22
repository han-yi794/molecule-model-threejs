// verify_layout_move.js — 输入面板右上角 + ? 按钮右下角 验证
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8047;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=laymv1`;
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
        await page.waitForFunction(() => typeof window.__generateFromSmiles === 'function', null, { timeout: 30000 });
        await page.waitForTimeout(1000);
        const out = {};
        const step = (name, ok, detail) => report.results.push({ name, ok: !!ok, detail });

        // S1: input-panel 位于右上角,默认收起
        out.S1 = await page.evaluate(() => {
            const p = document.getElementById('input-panel');
            if (!p) return { fail: 'missing' };
            const r = p.getBoundingClientRect();
            return {
                right: Math.round(innerWidth - r.right), top: Math.round(r.top),
                collapsedByDefault: !p.classList.contains('open') && document.getElementById('input-panel-body').style.display === 'none',
                toggleText: document.getElementById('input-panel-toggle').textContent
            };
        });
        step('S1 输入面板右上角且默认收起', out.S1.top <= 25 && out.S1.right <= 25 && out.S1.collapsedByDefault, out.S1);

        // S1b: 默认收起态下首次点击 = 展开(记忆 '1')
        await page.click('#input-panel-toggle');
        out.S1b = await page.evaluate(() => {
            const p = document.getElementById('input-panel');
            const body = document.getElementById('input-panel-body');
            return { opened: body.style.display !== 'none', mem: localStorage.getItem('INPUT_PANEL_OPEN') };
        });
        step('S1b 点击展开并记忆', out.S1b.opened && out.S1b.mem === '1', out.S1b);

        // S1c: 再点收起,与原子库不重叠(记忆 '0')
        await page.click('#input-panel-toggle');
        out.S1c = await page.evaluate(() => {
            const p = document.getElementById('input-panel').getBoundingClientRect();
            const sb = document.getElementById('sidebar').getBoundingClientRect();
            return {
                collapsed: document.getElementById('input-panel-body').style.display === 'none',
                noOverlap: p.bottom <= sb.top + 2,
                panelBottom: Math.round(p.bottom), sidebarTop: Math.round(sb.top),
                mem: localStorage.getItem('INPUT_PANEL_OPEN')
            };
        });
        step('S1c 再点收起、与原子库不重叠且记忆', out.S1c.collapsed && out.S1c.noOverlap && out.S1c.mem === '0', out.S1c);

        // S2: btn-help 在右下角且不与 mode-badge 重叠
        out.S2 = await page.evaluate(() => {
            const h = document.getElementById('btn-help').getBoundingClientRect();
            const b = document.getElementById('mode-badge').getBoundingClientRect();
            const noOverlap = h.right <= b.left + 2 || h.left >= b.right - 2 || h.bottom <= b.top + 2 || h.top >= b.bottom - 2;
            return {
                helpRight: Math.round(innerWidth - h.right), helpBottom: Math.round(innerHeight - h.bottom),
                badgeLeft: Math.round(b.left), helpRightEdge: Math.round(h.right),
                noOverlap
            };
        });
        step('S2 ? 在右下角(bottom≈16)且与徽章并排不重叠', out.S2.helpBottom <= 22 && out.S2.helpRight <= 140 && out.S2.noOverlap, out.S2);

        // S3: sidebar 中不再含输入模块,功能仍可用
        out.S3 = await page.evaluate(async () => {
            const inSidebar = !!document.querySelector('#sidebar .molecule-input-row');
            const r = await window.__generateFromSmiles('CCO');
            return { inSidebar, ok: r && r.ok, atoms: r && r.atomCount };
        });
        step('S3 输入模块已从侧栏移出且生成功能正常', !out.S3.inSidebar && out.S3.ok && out.S3.atoms === 9, out.S3);

        // S4: UI 路径生成(展开面板→输入→点按钮)后自动折叠
        await page.evaluate(() => window.__setInputPanelOpen(true));
        await page.fill('#name-input', '');
        await page.fill('#smiles-input', 'CC(=O)O');
        await page.click('#btn-molecule-from-input');
        // 乙酸 8 原子;PubChem 3D 路径可能需数秒(超时后本地回退也是 8)
        await page.waitForFunction(() => window.__diag.atomPositions().length === 8, null, { timeout: 15000 }).catch(() => {});
        out.S4 = await page.evaluate(() => ({
            atoms: window.__diag.atomPositions().length,
            autoCollapsed: document.getElementById('input-panel-body').style.display === 'none'
        }));
        step('S4 生成成功(8原子乙酸)且输入面板自动折叠', out.S4.atoms === 8 && out.S4.autoCollapsed, out.S4);

        // S5: 帮助按钮可点开 overlay
        await page.click('#btn-help');
        out.S5 = await page.evaluate(() => ({ overlayVisible: getComputedStyle(document.getElementById('help-overlay')).display !== 'none' }));
        step('S5 ? 点击打开操作指南', out.S5.overlayVisible, out.S5);
        await page.click('#help-close').catch(() => {});
        await page.waitForTimeout(200);

        await page.screenshot({ path: 'd_laymv.png' });
        console.log(JSON.stringify(report, null, 1));
    } catch (e) {
        report.results.push({ name: 'FATAL', ok: false, data: String(e).slice(0, 400) });
        console.log(JSON.stringify(report, null, 1));
    }
    await browser.close();
    if (serverProc) serverProc.kill();
})().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });