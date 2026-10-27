// verify_layout_move.js — 三栏工作台响应式几何验证（2026-10-27 重设计）
// 覆盖 1440 / 1100 / 1024 / 768 / 700 / 640 / 390 七档：
//   三栏网格列宽、8/10/12px 边距与间距、无横向溢出、顶栏 44px、
//   768 双 44px 轨道、700-899 展开一侧自动收起另一侧、
//   ≤699 底部栏出现 + 面板变底部抽屉（默认隐藏、打开不越界）、
//   手机生成抽屉贴底不挡底部栏、零 console 错误。
// 运行：cmd /c "node verify_layout_move.js > out.json 2>&1"（timeout 900000ms）
const { chromium } = require('playwright');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 8047;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=layout2`;
const SHOT = 'C:\\Users\\Administrator\\AppData\\Local\\Temp\\opencode\\';

async function probe(url) { return new Promise(res => { const req = http.get(url, r => { r.resume(); res(true); }); req.on('error', () => res(false)); req.setTimeout(3000, () => { req.destroy(); res(false); }); }); }
async function waitPort(ms) { const dl = Date.now() + ms; while (Date.now() < dl) { if (await probe(`http://127.0.0.1:${PORT}/`)) return true; await new Promise(r => setTimeout(r, 500)); } return false; }
async function ensureServer() { if (await waitPort(1000)) return null; for (const bin of ['python', 'py']) { const p = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() }); if (await waitPort(15000)) return p; p.kill(); } return null; }

(async () => {
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const report = { results: [], consoleErrors: [] };
    const step = (name, ok, detail) => report.results.push({ name, ok: !!ok, detail });

    // 每档独立 context：localStorage 干净，避免上一档的面板记忆影响断点默认值
    const measure = async (w, h, opts = {}) => {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: !!opts.mobile, hasTouch: !!opts.mobile, deviceScaleFactor: opts.mobile ? 2 : 1 });
        const page = await ctx.newPage();
        page.on('pageerror', e => report.consoleErrors.push(`${w}x${h} PAGEERROR: ` + String(e).slice(0, 200)));
        page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(`${w}x${h}: ` + m.text().slice(0, 200)); });
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__panels && window.__diag), null, { timeout: 30000 });
        await page.evaluate(() => window.__setInputPanelOpen(false));
        await page.waitForTimeout(350);
        return { page, ctx };
    };

    const geom = (page) => page.evaluate(() => {
        const r = (id) => { const el = document.getElementById(id); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) }; };
        const shell = document.getElementById('shell');
        const cs = getComputedStyle(shell);
        return {
            vw: innerWidth, vh: innerHeight,
            topbar: r('topbar'), build: r('build-panel'), well: r('well'), inspect: r('inspect-panel'),
            canvasHost: r('canvas-host'), bar: r('status-bar'), mobilebar: r('mobilebar'),
            mobilebarDisplay: getComputedStyle(document.getElementById('mobilebar')).display,
            pad: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' '),
            gap: cs.columnGap,
            overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            buildCollapsed: document.getElementById('build-panel').classList.contains('collapsed'),
            inspectCollapsed: document.getElementById('inspect-panel').classList.contains('collapsed'),
            cols: cs.gridTemplateColumns
        };
    });

    try {
        // ---------- L1 1440：三栏 224 / 自适应 / 224 ----------
        {
            const { page, ctx } = await measure(1440, 900);
            const g = await geom(page);
            step('L1 1440×900：三栏 224 / 自适应 / 224，8px 边距 + 12px 间距，画布井 952',
                g.topbar.h === 44 && g.build.w === 224 && g.inspect.w === 224
                && g.build.x === 8 && g.inspect.r === 1432
                && g.well.x === g.build.r + 12 && g.inspect.x === g.well.r + 12 && g.well.w === 952
                && g.gap === '12px' && g.pad === '12px 8px 8px 8px'
                && g.bar.b === g.well.b - 1 && g.canvasHost.h === g.well.h - 32
                && g.mobilebarDisplay === 'none' && g.overflowX === 0,
                { topbar: g.topbar, build: g.build, well: g.well, inspect: g.inspect, pad: g.pad, gap: g.gap });
            await page.screenshot({ path: SHOT + 'layout_1440.png' });
            await ctx.close();
        }

        // ---------- L2 1100：仍是三栏（≥1100 断点） ----------
        {
            const { page, ctx } = await measure(1100, 800);
            const g = await geom(page);
            step('L2 1100×800：仍为三栏（224/224），画布井 ≥600、无横向溢出',
                g.build.w === 224 && g.inspect.w === 224 && g.well.w === 612 && g.well.w >= 600
                && g.inspect.r === 1092 && g.overflowX === 0 && g.mobilebarDisplay === 'none',
                { build: g.build, well: g.well, inspect: g.inspect, cols: g.cols });
            await ctx.close();
        }

        // ---------- L3 1024：三栏但间距收窄到 10px ----------
        {
            const { page, ctx } = await measure(1024, 768);
            const g = await geom(page);
            step('L3 1024×768：三栏 + 10px 间距（画布井 540）、无横向溢出',
                g.build.w === 224 && g.inspect.w === 224 && g.gap === '10px' && g.well.w === 540
                && g.well.x === g.build.r + 10 && g.overflowX === 0,
                { build: g.build, well: g.well, inspect: g.inspect, gap: g.gap });
            await ctx.close();
        }

        // ---------- L4 768：两侧默认 44px 轨道 ----------
        {
            const { page, ctx } = await measure(768, 1024);
            const g = await geom(page);
            step('L4 768×1024：两侧默认 44px 轨道（画布井 644）、无横向溢出',
                g.build.w === 44 && g.inspect.w === 44 && g.buildCollapsed && g.inspectCollapsed
                && g.well.w === 644 && g.well.x === g.build.r + 10 && g.overflowX === 0
                && g.mobilebarDisplay === 'none',
                { build: g.build, well: g.well, inspect: g.inspect });
            await page.screenshot({ path: SHOT + 'layout_768.png' });
            await ctx.close();
        }

        // ---------- L5 700：展开一侧自动收起另一侧 ----------
        {
            const { page, ctx } = await measure(700, 900);
            const g0 = await geom(page);
            await page.click('#group-sidebar-toggle');
            await page.waitForTimeout(450);
            const g1 = await geom(page);
            step('L5 700×900：默认双轨；展开构建台（224）自动收起检查器（44），画布不被挤破',
                g0.build.w === 44 && g0.inspect.w === 44
                && g1.build.w === 224 && !g1.buildCollapsed && g1.inspect.w === 44 && g1.inspectCollapsed
                && g1.well.w === 396 && g1.overflowX === 0,
                { before: { build: g0.build, inspect: g0.inspect, well: g0.well }, after: { build: g1.build, inspect: g1.inspect, well: g1.well } });
            await ctx.close();
        }

        // ---------- L6 640：底部栏出现、面板变隐藏的底部抽屉 ----------
        {
            const { page, ctx } = await measure(640, 900, { mobile: true });
            const g = await geom(page);
            const sheet = await page.evaluate(() => {
                const p = document.getElementById('build-panel');
                const r = p.getBoundingClientRect();
                return { vis: getComputedStyle(p).visibility, y: Math.round(r.y), maxH: getComputedStyle(p).maxHeight, pos: getComputedStyle(p).position };
            });
            step('L6 640×900：底部栏出现、画布井满宽、面板改为隐藏的底部抽屉',
                g.mobilebarDisplay === 'flex' && g.mobilebar.b === 900 && g.mobilebar.h >= 48
                && g.well.w === 624 && g.overflowX === 0
                && sheet.pos === 'fixed' && sheet.vis === 'hidden' && sheet.y >= 900 - 8,
                { well: g.well, mobilebar: g.mobilebar, sheet, overflowX: g.overflowX });
            await ctx.close();
        }

        // ---------- L7 390：手机三按钮 + 抽屉/生成面板不挡底部栏 ----------
        {
            const { page, ctx } = await measure(390, 844, { mobile: true });
            const g = await geom(page);
            const btns = await page.evaluate(() => [...document.querySelectorAll('#mobilebar .mb-btn')].map(b => ({ id: b.id, text: b.innerText.trim(), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })));
            await page.click('#mb-build');
            await page.waitForTimeout(500);
            const sheet = await page.evaluate(() => {
                const p = document.getElementById('build-panel');
                const r = p.getBoundingClientRect();
                return { open: p.classList.contains('sheet-open'), y: Math.round(r.y), b: Math.round(r.bottom), h: Math.round(r.height), scrollH: p.scrollHeight, clientH: p.clientHeight };
            });
            await page.screenshot({ path: SHOT + 'layout_390_sheet.png' });
            await page.click('#mb-generate');
            await page.waitForTimeout(500);
            const drawer = await page.evaluate(() => {
                const d = document.getElementById('input-panel');
                const r = d.getBoundingClientRect();
                return { open: d.classList.contains('open'), vis: getComputedStyle(d).visibility, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), b: Math.round(r.bottom), h: Math.round(r.height) };
            });
            await page.screenshot({ path: SHOT + 'layout_390_drawer.png' });
            const allButtonsInside = btns.length === 3 && btns.every(b => b.w > 100 && b.h >= 40);
            step('L7 390×844：底部栏三按钮、构建抽屉停在栏上方、生成抽屉 374 宽不挡栏',
                g.mobilebarDisplay === 'flex' && allButtonsInside
                && g.well.w === 374 && g.overflowX === 0
                && sheet.open && sheet.b <= 844 - 50 && sheet.y > 100
                && drawer.open && drawer.vis === 'visible' && drawer.w === 374 && drawer.x === 8
                && drawer.b <= 844 - 50 && drawer.y >= 44,
                { mobilebar: g.mobilebar, btns, sheet, drawer });
            await ctx.close();
        }

        // ---------- L8 零 console 错误 ----------
        step('L8 七档断点全程零 console 错误', report.consoleErrors.length === 0, report.consoleErrors.slice(0, 5));
    } catch (e) {
        report.results.push({ name: 'FATAL', ok: false, detail: String(e && e.stack || e).slice(0, 900) });
    }

    const passed = report.results.filter(r => r.ok).length;
    report.summary = { total: report.results.length, passed, failed: report.results.length - passed };
    console.log(JSON.stringify(report, null, 2));
    console.log(`\n== verify_layout_move: ${passed}/${report.results.length} passed ==`);
    await browser.close();
    if (serverProc) serverProc.kill();
    process.exit(passed === report.results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
