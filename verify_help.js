// verify_help.js — 帮助浮层 + 视图段并入检查器 验证（2026-10-27 重设计，替代 verify_guide_panel.js）
// 覆盖：#guide-panel / #settings-panel 已删除；顶栏 #btn-help 打开 #help-overlay 操作指南
//       （鼠标 / 快捷键 / 拖动方式 / 提示 四段 + Esc 说明）；✕、点暗背景、Escape 三种关闭；
//       视图开关（自动补氢/孤对/网格/离域π/π高亮 + 原子材质）已在检查器「视图」段；
//       390 手机浮层不超屏且卡片可滚动；零 console 错误。
// 运行：cmd /c "node verify_help.js > out.json 2>&1"（timeout 900000ms）
const { chromium } = require('playwright');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 8046;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=help2`;
const SHOT = 'C:\\Users\\Administrator\\AppData\\Local\\Temp\\opencode\\';

async function probe(url) { return new Promise(res => { const req = http.get(url, r => { r.resume(); res(true); }); req.on('error', () => res(false)); req.setTimeout(3000, () => { req.destroy(); res(false); }); }); }
async function waitPort(ms) { const dl = Date.now() + ms; while (Date.now() < dl) { if (await probe(`http://127.0.0.1:${PORT}/`)) return true; await new Promise(r => setTimeout(r, 500)); } return false; }
async function ensureServer() { if (await waitPort(1000)) return null; for (const bin of ['python', 'py']) { const p = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() }); if (await waitPort(15000)) return p; p.kill(); } return null; }

(async () => {
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1289, height: 896 } });
    const report = { results: [], consoleErrors: [] };
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 250)); });
    const step = (name, ok, detail) => report.results.push({ name, ok: !!ok, detail });
    const overlayShown = () => page.evaluate(() => getComputedStyle(document.getElementById('help-overlay')).display !== 'none');
    const settle = async () => { await page.waitForTimeout(320); };

    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__panels && window.__diag), null, { timeout: 30000 });
        await page.evaluate(() => window.__setInputPanelOpen(false));
        await settle();

        // H1 旧角落控件删除 + 帮助按钮在顶栏 + 浮层默认隐藏
        const h1 = await page.evaluate(() => {
            const btn = document.getElementById('btn-help');
            const r = btn ? btn.getBoundingClientRect() : null;
            return {
                guide: !!document.getElementById('guide-panel'),
                settings: !!document.getElementById('settings-panel'),
                info: !!document.getElementById('info'),
                btn: !!btn, inTopbar: !!(btn && btn.closest('#topbar')),
                btnIcon: !!(btn && btn.querySelector('svg[data-icon="circle-help"]')),
                btnRect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
                hidden: getComputedStyle(document.getElementById('help-overlay')).display === 'none',
                card: !!document.getElementById('help-card')
            };
        });
        step('H1 #guide-panel / #settings-panel / #info 已删除；#btn-help 在顶栏（circle-help 图标，浮层默认隐藏）',
            !h1.guide && !h1.settings && !h1.info && h1.btn && h1.inTopbar && h1.btnIcon
            && h1.btnRect && h1.btnRect.h === 32 && h1.hidden && h1.card,
            h1);

        // H2 点击打开：四段内容齐全（鼠标 / 快捷键 / 拖动方式 / 提示）+ Esc 说明
        await page.click('#btn-help');
        await settle();
        const h2 = await page.evaluate(() => {
            const ov = document.getElementById('help-overlay');
            const card = document.getElementById('help-card');
            const cs = getComputedStyle(card);
            const r = card.getBoundingClientRect();
            const heads = [...card.querySelectorAll('h3')].map(h => h.innerText.replace(/\s+/g, ' ').trim());
            return {
                shown: getComputedStyle(ov).display !== 'none',
                visible: getComputedStyle(ov).visibility !== 'hidden' && getComputedStyle(ov).opacity !== '0',
                heads,
                text: card.innerText,
                radius: cs.borderTopLeftRadius,
                shadow: cs.boxShadow,
                rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
                vw: innerWidth, vh: innerHeight,
                overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
            };
        });
        const headsOk = ['鼠标操作', '快捷键', '拖动方式', '提示'].every(t => h2.heads.some(x => x.includes(t)));
        step('H2 点击 #btn-help 打开操作指南：四段齐全 + 关键快捷键 + Esc 说明',
            h2.shown && h2.visible && headsOk
            && /全局同步优化/.test(h2.text) && /Shift\+Tab/.test(h2.text) && /Ctrl\+Z/.test(h2.text)
            && /0\.25Å/.test(h2.text) && /Esc/.test(h2.text) && /生成抽屉/.test(h2.text),
            { shown: h2.shown, heads: h2.heads, text: h2.text.slice(0, 200) });

        // H3 卡片居中、尺寸受控、不溢出视口
        step('H3 帮助卡片居中且不溢出视口（圆角 + 可滚动）',
            Math.abs(h2.rect.x + h2.rect.w / 2 - h2.vw / 2) <= 2
            && h2.rect.w === 620 && h2.rect.h <= h2.vh - 48 && h2.overflowX === 0
            && h2.radius === '8px' && h2.shadow === 'none',
            h2.rect);
        await page.screenshot({ path: SHOT + 'help_open.png' });

        // H4 ✕ 关闭
        await page.click('#help-close');
        await settle();
        const h4 = !(await overlayShown());

        // H5 点暗背景关闭
        await page.click('#btn-help');
        await settle();
        await page.mouse.click(12, 880);   // 浮层空白处（卡片外）
        await settle();
        const h5 = !(await overlayShown());

        // H6 Escape 关闭（与生成抽屉的分层关闭互不干扰）
        await page.click('#btn-help');
        await settle();
        const h6a = await overlayShown();
        await page.keyboard.press('Escape');
        await settle();
        const h6b = await overlayShown();
        const drawerAfterEsc = await page.evaluate(() => document.getElementById('input-panel').classList.contains('open'));
        step('H4/H5/H6 ✕ / 点暗背景 / Escape 三种方式都能关闭操作指南',
            h4 && h5 && h6a && !h6b && drawerAfterEsc === false,
            { closeBtn: h4, backdrop: h5, escape: { before: h6a, after: h6b }, drawer: drawerAfterEsc });

        // H7 视图开关已在检查器「视图」段（设置面板合并）
        const h7 = await page.evaluate(() => {
            const ins = document.getElementById('inspect-panel');
            const heads = [...ins.querySelectorAll('.ins-sec-head')].map(h => h.textContent.trim());
            const has = (id) => !!ins.querySelector('#' + id);
            const sel = document.getElementById('atom-style-select');
            return {
                heads,
                toggles: ['btn-toggle-hydro', 'btn-toggle-lp', 'btn-toggle-grid', 'btn-toggle-deloc', 'btn-toggle-pi'].filter(has),
                styleSelect: !!sel && !!sel.closest('#inspect-panel'),
                styleOptions: sel ? sel.options.length : 0,
                outsidePanel: ['btn-toggle-hydro', 'btn-toggle-lp', 'btn-toggle-grid', 'btn-toggle-deloc', 'btn-toggle-pi', 'atom-style-select']
                    .filter(id => { const el = document.getElementById(id); return el && !el.closest('#inspect-panel'); })
            };
        });
        step('H7 视图开关全部并入检查器「视图」段（5 个开关 + 原子材质 4 选项）',
            h7.heads.includes('视图') && h7.toggles.length === 5 && h7.styleSelect && h7.styleOptions === 4
            && h7.outsidePanel.length === 0,
            h7);

        // H8 390×844：浮层与卡片不超屏，卡片可滚动
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(350);
        await page.click('#btn-help');
        await settle();
        const h8 = await page.evaluate(() => {
            const ov = document.getElementById('help-overlay');
            const card = document.getElementById('help-card');
            const r = card.getBoundingClientRect();
            const cs = getComputedStyle(card);
            return {
                shown: getComputedStyle(ov).display !== 'none',
                rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom) },
                vw: innerWidth, vh: innerHeight,
                overflowY: cs.overflowY,
                scrollable: card.scrollHeight >= card.clientHeight,
                overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
            };
        });
        step('H8 390×844：帮助卡片 366 宽（两侧 12px）、上下不超屏、纵向可滚动',
            h8.shown && h8.rect.w === 366 && h8.rect.x === 12 && h8.rect.y >= 0 && h8.rect.b <= 844
            && h8.overflowY === 'auto' && h8.overflowX === 0,
            h8);
        await page.screenshot({ path: SHOT + 'help_mobile.png' });

        // H9 手机端 Escape 也能关
        await page.keyboard.press('Escape');
        await settle();
        step('H9 手机端 Escape 关闭帮助浮层', !(await overlayShown()), {});

        // H10 零 console 错误
        step('H10 零 console 错误', report.consoleErrors.length === 0, report.consoleErrors.slice(0, 5));
    } catch (e) {
        report.results.push({ name: 'FATAL', ok: false, detail: String(e && e.stack || e).slice(0, 900) });
    }

    const passed = report.results.filter(r => r.ok).length;
    report.summary = { total: report.results.length, passed, failed: report.results.length - passed };
    console.log(JSON.stringify(report, null, 2));
    console.log(`\n== verify_help: ${passed}/${report.results.length} passed ==`);
    await browser.close();
    if (serverProc) serverProc.kill();
    process.exit(passed === report.results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
