// verify_sidebars.js — 三栏工作台面板折叠验证（2026-10-27 重设计版）
// 覆盖：桌面 构建台/检查器 展开态与头部（标题/caret/aria）、折叠为 44px 轨道、
//       键盘 Enter/Space、面板状态记忆（PANEL_BUILD_OPEN / PANEL_INSPECT_OPEN）、
//       768 平板默认双轨 + 展开一侧自动收起另一侧、
//       390 手机底部栏 + 构建/检查底部抽屉互斥 + 生成抽屉不挡底部栏、
//       折叠往返后原子卡拖拽仍可用、零 console 错误。
// 运行：cmd /c "node verify_sidebars.js > out.json 2>&1"（timeout 900000ms）
const { chromium } = require('playwright');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 8063;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=panels2`;
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

    const readPanels = () => page.evaluate(() => {
        const read = (id) => {
            const p = document.getElementById(id);
            if (!p) return { found: false };
            const head = p.querySelector('.panel-head');
            const r = p.getBoundingClientRect();
            const cards = [...p.querySelectorAll('.atom-card, .group-card')];
            const title = head && head.querySelector('.panel-title');
            const caret = head && head.querySelector('.panel-caret');
            const tcs = title ? getComputedStyle(title) : null;
            return {
                found: true,
                collapsed: p.classList.contains('collapsed'),
                width: Math.round(r.width), height: Math.round(r.height),
                left: Math.round(r.left), right: Math.round(r.right),
                top: Math.round(r.top), bottom: Math.round(r.bottom),
                visibleCards: cards.filter(c => c.getBoundingClientRect().width > 0 && getComputedStyle(c).display !== 'none').length,
                totalCards: cards.length,
                titleText: title ? title.textContent.trim() : '',
                titleVertical: tcs ? tcs.writingMode.startsWith('vertical') : false,
                caret: caret ? caret.dataset.icon : null,
                caretSvg: !!(caret && caret.querySelector('svg')),
                headTitle: head ? head.title : '',
                ariaExpanded: head ? head.getAttribute('aria-expanded') : null,
                sheetOpen: p.classList.contains('sheet-open'),
                vis: getComputedStyle(p).visibility
            };
        };
        return {
            build: read('build-panel'),
            inspect: read('inspect-panel'),
            groups: read('group-sidebar'),
            atoms: read('sidebar'),
            vw: innerWidth, vh: innerHeight,
            mem: {
                build: localStorage.getItem('PANEL_BUILD_OPEN'),
                inspect: localStorage.getItem('PANEL_INSPECT_OPEN')
            },
            mobilebar: getComputedStyle(document.getElementById('mobilebar')).display,
            api: !!(window.__panels && window.__panels.set && window.__panels.state && window.__sidebars && window.__sidebars.set),
            overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });

    const waitReady = async () => {
        await page.waitForFunction(() => !!(window.__panels && window.__diag && window.__lpStats), null, { timeout: 30000 });
        await page.waitForTimeout(300);
    };

    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await waitReady();
        await page.evaluate(() => window.__setInputPanelOpen(false));
        await page.waitForTimeout(250);

        // P1 桌面默认：两侧 224px、卡片齐全、标题水平、caret 指向收起侧
        let st = await readPanels();
        step('P1 桌面默认展开：构建台/检查器各 224px、卡片 8/9 齐全、caret 指向收起侧',
            st.build.found && st.inspect.found && !st.build.collapsed && !st.inspect.collapsed
            && st.build.width === 224 && st.inspect.width === 224
            && st.atoms.visibleCards === 8 && st.atoms.totalCards === 8
            && st.groups.visibleCards === 9 && st.groups.totalCards === 9
            && st.groups.titleText === '基团' && st.atoms.titleText === '元素'
            && !st.groups.titleVertical && !st.atoms.titleVertical
            && st.groups.caret === 'chevron-left' && st.inspect.caret === 'chevron-right'
            && st.groups.caretSvg && st.inspect.caretSvg
            && st.mem.build === null && st.mem.inspect === null && st.api && st.overflowX === 0,
            { build: st.build, inspect: st.inspect, groups: st.groups, atoms: st.atoms, mem: st.mem, api: st.api });
        await page.screenshot({ path: SHOT + 'panels_desktop_open.png' });

        // P2 点击构建台头部 → 整栏收起 44px（两个 section 都变成竖排轨道）
        await page.click('#group-sidebar-toggle');
        await page.waitForTimeout(400);
        st = await readPanels();
        step('P2 收起构建台：宽 44、卡片全隐、标题竖排、caret→、记忆 0、检查器不受影响',
            st.build.collapsed && st.build.width === 44 && st.build.visibleCards === 0
            && st.groups.titleVertical && st.atoms.titleVertical
            && st.groups.caret === 'chevron-right' && st.atoms.caret === 'chevron-right'
            && st.groups.ariaExpanded === 'false' && st.mem.build === '0'
            && !st.inspect.collapsed && st.inspect.width === 224 && st.overflowX === 0,
            { build: st.build, groups: st.groups, atoms: st.atoms, mem: st.mem });
        await page.screenshot({ path: SHOT + 'panels_build_collapsed.png' });

        // P3 再点展开：恢复 224 / 卡片 / caret← / 记忆 1
        await page.click('#group-sidebar-toggle');
        await page.waitForTimeout(400);
        st = await readPanels();
        step('P3 再点展开构建台：宽 224、卡片恢复、caret←、记忆 1',
            !st.build.collapsed && st.build.width === 224 && st.atoms.visibleCards === 8 && st.groups.visibleCards === 9
            && st.groups.caret === 'chevron-left' && st.groups.ariaExpanded === 'true' && st.mem.build === '1',
            { build: st.build, mem: st.mem });

        // P4 检查器折叠/展开（#inspect-toggle）
        await page.click('#inspect-toggle');
        await page.waitForTimeout(400);
        st = await readPanels();
        const iCollapsed = st.inspect.collapsed && st.inspect.width === 44 && st.inspect.caret === 'chevron-left'
            && st.inspect.titleVertical && st.mem.inspect === '0' && !st.build.collapsed && st.build.width === 224;
        await page.click('#inspect-toggle');
        await page.waitForTimeout(400);
        st = await readPanels();
        const iExpanded = !st.inspect.collapsed && st.inspect.width === 224 && st.inspect.caret === 'chevron-right' && st.mem.inspect === '1';
        step('P4 检查器收起（44px/竖排/caret←）再展开恢复', iCollapsed && iExpanded, { iCollapsed, iExpanded, inspect: st.inspect });

        // P5 键盘 Enter 收起 / Space 展开
        await page.focus('#inspect-toggle');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(350);
        const kb1 = (await readPanels()).inspect;
        await page.keyboard.press('Space');
        await page.waitForTimeout(350);
        const kb2 = (await readPanels()).inspect;
        step('P5 键盘 Enter 收起 / Space 展开（焦点留在头部）',
            kb1.collapsed && kb1.width === 44 && !kb2.collapsed && kb2.width === 224,
            { afterEnter: kb1, afterSpace: kb2 });

        // P6 刷新保持：两栏记忆为收起 → reload 后仍 44px；清记忆后回默认 224px
        await page.evaluate(() => { localStorage.setItem('PANEL_BUILD_OPEN', '0'); localStorage.setItem('PANEL_INSPECT_OPEN', '0'); });
        await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
        await waitReady();
        await page.evaluate(() => window.__setInputPanelOpen(false));
        st = await readPanels();
        const persisted = st.build.collapsed && st.inspect.collapsed && st.build.width === 44 && st.inspect.width === 44;
        await page.evaluate(() => { localStorage.removeItem('PANEL_BUILD_OPEN'); localStorage.removeItem('PANEL_INSPECT_OPEN'); });
        await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
        await waitReady();
        await page.evaluate(() => window.__setInputPanelOpen(false));
        st = await readPanels();
        const restored = !st.build.collapsed && !st.inspect.collapsed && st.build.width === 224 && st.inspect.width === 224;
        step('P6 刷新后保持收起（记忆 0）；清记忆后恢复默认展开', persisted && restored,
            { persisted, restored, build: st.build, inspect: st.inspect });

        // P7 平板 768：两侧默认 44px 轨道；展开构建台自动收起检查器（画布不挤压到 <500）
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.evaluate(() => { localStorage.removeItem('PANEL_BUILD_OPEN'); localStorage.removeItem('PANEL_INSPECT_OPEN'); });
        await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
        await waitReady();
        await page.evaluate(() => window.__setInputPanelOpen(false));
        st = await readPanels();
        const tabDefault = st.build.width === 44 && st.inspect.width === 44 && !st.build.sheetOpen && st.overflowX === 0;
        await page.click('#group-sidebar-toggle');
        await page.waitForTimeout(450);
        st = await readPanels();
        const tabExpand = !st.build.collapsed && st.build.width === 224 && st.inspect.collapsed && st.inspect.width === 44 && st.overflowX === 0;
        await page.screenshot({ path: SHOT + 'panels_tablet_build_open.png' });
        step('P7 平板 768：默认双 44px 轨道；展开构建台自动收起检查器', tabDefault && tabExpand,
            { tabDefault, tabExpand, build: st.build, inspect: st.inspect });

        // P8 手机 390：底部栏可见、面板是底部抽屉、构建/检查互斥、生成抽屉不挡底部栏
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(450);
        st = await readPanels();
        const mobDefault = st.mobilebar === 'flex' && st.build.sheetOpen === false && st.inspect.sheetOpen === false
            && st.build.vis === 'hidden' && st.inspect.vis === 'hidden' && st.overflowX === 0;
        const mbBuild = await page.locator('#mb-build').boundingBox();
        const mbInspect = await page.locator('#mb-inspect').boundingBox();
        await page.click('#mb-build');
        await page.waitForTimeout(500);
        st = await readPanels();
        const mobBuild = st.build.sheetOpen && !st.inspect.sheetOpen && st.build.bottom <= st.vh - 50 && st.build.top > 100;
        const sheetFits = await page.evaluate(() => {
            const p = document.getElementById('build-panel');
            return p.scrollHeight > 0 && p.getBoundingClientRect().bottom <= innerHeight - 50;
        });
        await page.screenshot({ path: SHOT + 'panels_mobile_build.png' });
        await page.click('#mb-inspect');
        await page.waitForTimeout(500);
        st = await readPanels();
        const mobInspect = st.inspect.sheetOpen && !st.build.sheetOpen;
        await page.click('#mb-generate');
        await page.waitForTimeout(500);
        const drawer = await page.evaluate(() => {
            const d = document.getElementById('input-panel');
            const r = d.getBoundingClientRect();
            return { open: d.classList.contains('open'), bottom: Math.round(r.bottom), top: Math.round(r.top), h: Math.round(r.height), vis: getComputedStyle(d).visibility };
        });
        const drawerOk = drawer.open && drawer.vis === 'visible' && drawer.bottom <= 844 - 50 && drawer.top >= 44;
        await page.screenshot({ path: SHOT + 'panels_mobile_drawer.png' });
        step('P8 手机 390：底部栏可见、构建/检查抽屉互斥、生成抽屉停在底部栏上方',
            mobDefault && mobBuild && sheetFits && mobInspect && drawerOk,
            { mobDefault, mobBuild, sheetFits, mobInspect, drawer, mbBuild, mbInspect });

        // P9 折叠往返后原子卡拖拽仍可用（碳卡 → 画布中心，原子数 +1）
        await page.setViewportSize({ width: 1289, height: 896 });
        await page.evaluate(() => { window.__setInputPanelOpen(false); window.__panels.set('build', false); window.__panels.set('inspect', false); });
        await page.waitForTimeout(450);
        const before = await page.evaluate(() => window.__lpStats().length);
        const card = await page.locator('#drag-carbon').boundingBox();
        await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
        await page.mouse.down();
        await page.mouse.move(660, 470, { steps: 14 });
        await page.waitForTimeout(150);
        await page.mouse.up();
        await page.waitForTimeout(500);
        const after = await page.evaluate(() => ({ n: window.__lpStats().length, atoms: window.__dragMode.atoms() }));
        const nearOrigin = after.atoms.length === 1 && Math.abs(after.atoms[0].p[0]) < 4 && Math.abs(after.atoms[0].p[2]) < 4;
        step('P9 折叠往返后原子卡拖拽仍可用（碳卡拖入画布 +1，且落在分子附近而非相机背后）',
            after.n === before + 1 && nearOrigin, { before, after: after.n, atoms: after.atoms, card });

        // P10 零 console 错误
        step('P10 零 console 错误', report.consoleErrors.length === 0, report.consoleErrors.slice(0, 5));
    } catch (e) {
        report.results.push({ name: 'FATAL', ok: false, detail: String(e && e.stack || e).slice(0, 800) });
    }

    const passed = report.results.filter(r => r.ok).length;
    report.summary = { total: report.results.length, passed, failed: report.results.length - passed };
    console.log(JSON.stringify(report, null, 2));
    console.log(`\n== verify_sidebars: ${passed}/${report.results.length} passed ==`);
    await browser.close();
    if (serverProc) serverProc.kill();
    process.exit(passed === report.results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
