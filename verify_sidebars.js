// verify_sidebars.js — 两侧栏（左侧「预设基团」/ 右侧「原子库」）折叠收起验证（2026-10-24）
// 覆盖：默认展开（卡片齐全/头部 caret 方向）、点击收起（窄胶囊/卡片隐藏/记忆）、再点展开、
//       左右独立、键盘 Enter/Space、刷新后状态保持、手机 375×667 窄屏胶囊不拉伸且不超屏、
//       折叠再展开后原子卡拖拽仍可用、零 console 错误。
// 运行：cmd /c "node verify_sidebars.js > verify_sidebars.out 2>&1"（timeout 900000ms）
const { chromium } = require('playwright');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 8063;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=sidebars1`;
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
            const head = p && p.querySelector('.sb-head');
            const r = p.getBoundingClientRect();
            const cards = [...p.querySelectorAll('.atom-card, .group-card')];
            const label = head && head.querySelector('.sb-head-label');
            const caret = head && head.querySelector('.sb-caret');
            return {
                found: !!p,
                collapsed: !!(p && p.classList.contains('sb-collapsed')),
                width: p ? Math.round(r.width) : 0,
                left: p ? Math.round(r.left) : 0,
                right: p ? Math.round(r.right) : 0,
                top: p ? Math.round(r.top) : 0,
                bottom: p ? Math.round(r.bottom) : 0,
                height: p ? Math.round(r.height) : 0,
                visibleCards: cards.filter(c => c.getBoundingClientRect().width > 0 && getComputedStyle(c).display !== 'none').length,
                totalCards: cards.length,
                labelShown: !!(label && getComputedStyle(label).display !== 'none' && label.getBoundingClientRect().width > 0),
                caret: caret ? caret.dataset.icon : null,
                caretSvg: !!(caret && caret.querySelector('svg')),
                title: head ? head.title : '',
                ariaExpanded: head ? head.getAttribute('aria-expanded') : null
            };
        };
        return {
            atoms: read('sidebar'),
            groups: read('group-sidebar'),
            vw: innerWidth, vh: innerHeight,
            mem: { atoms: localStorage.getItem('SIDEBAR_ATOMS_OPEN'), groups: localStorage.getItem('SIDEBAR_GROUPS_OPEN') },
            api: !!(window.__sidebars && window.__sidebars.set && window.__sidebars.state)
        };
    });
    const waitReady = async () => {
        await page.waitForFunction(() => !!(window.__sidebars && window.__diag && window.__lpStats), null, { timeout: 30000 });
        await page.waitForTimeout(250);
    };

    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await waitReady();
        // webdriver 环境输入面板默认展开，会盖住右上角原子库头部（真实浏览器默认收起）→ 先收起
        await page.evaluate(() => window.__setInputPanelOpen(false));
        await page.waitForTimeout(200);

        // S1 默认展开：两栏均展开、卡片齐全、head 标签可见、caret 朝收起侧
        let st = await readPanels();
        step('S1 默认展开：两栏宽≥120、卡片 8/9 全部可见、标签显示、caret 朝外',
            st.atoms.found && st.groups.found && !st.atoms.collapsed && !st.groups.collapsed
            && st.atoms.width >= 120 && st.groups.width >= 120
            && st.atoms.visibleCards === 8 && st.atoms.totalCards === 8
            && st.groups.visibleCards === 9 && st.groups.totalCards === 9
            && st.atoms.labelShown && st.groups.labelShown
            && st.atoms.caret === 'chevron-right' && st.groups.caret === 'chevron-left'
            && st.atoms.caretSvg && st.groups.caretSvg
            && st.mem.atoms === null && st.mem.groups === null && st.api,
            { atoms: st.atoms, groups: st.groups, mem: st.mem, api: st.api });

        // S2 点击右侧「原子库」头 → 收起为窄胶囊（卡片隐藏、caret 朝内、记忆 '0'、左栏不受影响）
        await page.click('#sidebar-toggle');
        await page.waitForTimeout(300);
        st = await readPanels();
        step('S2 点击原子库头收起：宽≤56、8 卡全隐、caret←、记忆 0、左栏仍展开',
            st.atoms.collapsed && st.atoms.width <= 56 && st.atoms.visibleCards === 0
            && !st.atoms.labelShown && st.atoms.caret === 'chevron-left'
            && st.atoms.ariaExpanded === 'false' && st.mem.atoms === '0'
            && !st.groups.collapsed && st.groups.visibleCards === 9,
            { atoms: st.atoms, groups: st.groups, mem: st.mem });
        await page.screenshot({ path: SHOT + 'sidebars_desktop_right_collapsed.png' });

        // S3 再点 → 展开恢复（宽度/卡片/caret/记忆）
        await page.click('#sidebar-toggle');
        await page.waitForTimeout(300);
        st = await readPanels();
        step('S3 再点原子库头展开：宽≥120、8 卡恢复、caret→、记忆 1',
            !st.atoms.collapsed && st.atoms.width >= 120 && st.atoms.visibleCards === 8
            && st.atoms.labelShown && st.atoms.caret === 'chevron-right'
            && st.atoms.ariaExpanded === 'true' && st.mem.atoms === '1',
            { atoms: st.atoms, mem: st.mem });

        // S4 左侧「预设基团」点击收起/再展开
        await page.click('#group-sidebar-toggle');
        await page.waitForTimeout(300);
        st = await readPanels();
        const gCollapsed = st.groups.collapsed && st.groups.width <= 56 && st.groups.visibleCards === 0
            && !st.groups.labelShown && st.groups.caret === 'chevron-right' && st.mem.groups === '0'
            && !st.atoms.collapsed && st.atoms.visibleCards === 8;
        await page.click('#group-sidebar-toggle');
        await page.waitForTimeout(300);
        st = await readPanels();
        const gExpanded = !st.groups.collapsed && st.groups.width >= 120 && st.groups.visibleCards === 9
            && st.groups.labelShown && st.groups.caret === 'chevron-left' && st.mem.groups === '1';
        step('S4 左侧预设基团收起（宽≤56/9 卡全隐/caret→）再展开恢复', gCollapsed && gExpanded, { gCollapsed, gExpanded, groups: st.groups });

        // S5 键盘操作：焦点在头部时 Enter 收起、Space 展开
        await page.focus('#sidebar-toggle');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(250);
        const kb1 = (await readPanels()).atoms;
        await page.keyboard.press('Space');
        await page.waitForTimeout(250);
        const kb2 = (await readPanels()).atoms;
        step('S5 键盘 Enter 收起 / Space 展开（焦点可留在头部）',
            kb1.collapsed && kb1.width <= 56 && !kb2.collapsed && kb2.visibleCards === 8,
            { afterEnter: kb1, afterSpace: kb2 });

        // S6 独立性：只收起右栏时左栏完全不受影响；两栏都不越出视口
        await page.evaluate(() => window.__sidebars.set('sidebar', true));
        await page.waitForTimeout(200);
        st = await readPanels();
        step('S6 两栏独立 + 都在视口内',
            st.atoms.collapsed && st.groups.visibleCards === 9 && !st.groups.collapsed
            && st.groups.left >= 0 && st.groups.top >= 0 && st.groups.bottom <= st.vh
            && st.atoms.right <= st.vw && st.atoms.top >= 0 && st.atoms.bottom <= st.vh,
            { atoms: st.atoms, groups: st.groups, vw: st.vw, vh: st.vh });

        // S7 刷新保持：两栏均记忆为收起 → reload 后仍收起；清记忆后恢复默认展开
        await page.evaluate(() => {
            localStorage.setItem('SIDEBAR_ATOMS_OPEN', '0');
            localStorage.setItem('SIDEBAR_GROUPS_OPEN', '0');
        });
        await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
        await waitReady();
        await page.evaluate(() => window.__setInputPanelOpen(false));
        st = await readPanels();
        const persisted = st.atoms.collapsed && st.groups.collapsed
            && st.atoms.visibleCards === 0 && st.groups.visibleCards === 0
            && st.atoms.width <= 56 && st.groups.width <= 56;
        await page.evaluate(() => {
            localStorage.removeItem('SIDEBAR_ATOMS_OPEN');
            localStorage.removeItem('SIDEBAR_GROUPS_OPEN');
        });
        await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
        await waitReady();
        await page.evaluate(() => window.__setInputPanelOpen(false));
        st = await readPanels();
        const restored = !st.atoms.collapsed && !st.groups.collapsed
            && st.atoms.visibleCards === 8 && st.groups.visibleCards === 9;
        step('S7 刷新后保持收起（记忆 0）；清记忆后恢复默认展开', persisted && restored,
            { persisted, restored, atoms: st.atoms, groups: st.groups });

        // S8 手机 375×667：展开态在视口内且互不重叠；收起后为贴顶窄胶囊（bottom:auto 不拉伸）
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(350);
        st = await readPanels();
        const mobileExpanded = !st.atoms.collapsed && !st.groups.collapsed
            && st.groups.left >= 0 && st.atoms.right <= st.vw
            && st.groups.right < st.atoms.left
            && st.groups.width >= 40 && st.atoms.width >= 40;
        await page.evaluate(() => { window.__sidebars.set('group-sidebar', true); window.__sidebars.set('sidebar', true); });
        await page.waitForTimeout(350);
        st = await readPanels();
        const mobileCollapsed = st.atoms.collapsed && st.groups.collapsed
            && st.atoms.width <= 56 && st.groups.width <= 56
            && st.atoms.height <= 64 && st.groups.height <= 64
            && st.atoms.top >= 95 && st.atoms.top <= 115
            && st.groups.top >= 95 && st.groups.top <= 115
            && st.atoms.bottom <= st.vh && st.groups.bottom <= st.vh
            && st.atoms.right <= st.vw;
        await page.screenshot({ path: SHOT + 'sidebars_mobile_collapsed.png' });
        await page.evaluate(() => window.__sidebars.set('sidebar', false));
        await page.waitForTimeout(250);
        st = await readPanels();
        const mobileReopen = !st.atoms.collapsed && st.atoms.visibleCards === 8
            && st.groups.collapsed && st.groups.visibleCards === 0;
        step('S8 手机 375×667：展开不重叠、收起为贴顶胶囊不拉伸、可单独再展开',
            mobileExpanded && mobileCollapsed && mobileReopen,
            { mobileExpanded, mobileCollapsed, mobileReopen, atoms: st.atoms, groups: st.groups, vw: st.vw, vh: st.vh });

        // S9 折叠/展开往返后，原子卡拖拽仍可用（真实鼠标：碳卡 → 画布中心，原子数 +1）
        await page.setViewportSize({ width: 1289, height: 896 });
        await page.evaluate(() => { window.__sidebars.set('group-sidebar', false); window.__sidebars.set('sidebar', false); });
        await page.waitForTimeout(350);
        const before = await page.evaluate(() => window.__lpStats().length);
        const card = await page.locator('#drag-carbon').boundingBox();
        await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
        await page.mouse.down();
        await page.mouse.move(650, 470, { steps: 14 });
        await page.waitForTimeout(150);
        await page.mouse.up();
        await page.waitForTimeout(450);
        const after = await page.evaluate(() => window.__lpStats().length);
        step('S9 折叠往返后原子卡拖拽仍可用（碳卡拖到画布：原子数 +1）',
            after === before + 1, { before, after, card });

        // S10 网关：零 console 错误
        step('S10 零 console 错误', report.consoleErrors.length === 0, report.consoleErrors.slice(0, 5));
    } catch (e) {
        report.results.push({ name: 'FATAL', ok: false, detail: String(e && e.stack || e).slice(0, 800) });
    }

    const passed = report.results.filter(r => r.ok).length;
    report.summary = { total: report.results.length, passed, failed: report.results.length - passed, ms: Date.now() - 0 };
    console.log(JSON.stringify(report, null, 2));
    for (const r of report.results) console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : ' :: ' + JSON.stringify(r.detail)));
    console.log(`\n== verify_sidebars: ${passed}/${report.results.length} passed ==`);
    await browser.close();
    if (serverProc) serverProc.kill();
    process.exit(passed === report.results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
