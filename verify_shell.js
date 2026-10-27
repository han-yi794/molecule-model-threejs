// verify_shell.js — 三栏工作台外壳验证（2026-10-27 重设计，替代 verify_corners.js）
// 覆盖：顶栏 44px（品牌/分子名/主操作按钮尺寸与不重叠）、三栏网格与 8/12px 间距、
//       面板边界（1px 边框 + 8px 圆角 + 无重阴影）、字号下限 11px、
//       状态条读数（空画布 → 苯）、画布空态提示、检查器读数、生成抽屉 360px 定位、
//       旧角落控件已移除、零 console 错误。
// 运行：cmd /c "node verify_shell.js > out.json 2>&1"（timeout 900000ms）
const { chromium } = require('playwright');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 8071;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=shell1`;

async function probe(url) { return new Promise(res => { const req = http.get(url, r => { r.resume(); res(true); }); req.on('error', () => res(false)); req.setTimeout(3000, () => { req.destroy(); res(false); }); }); }
async function waitPort(ms) { const dl = Date.now() + ms; while (Date.now() < dl) { if (await probe(`http://127.0.0.1:${PORT}/`)) return true; await new Promise(r => setTimeout(r, 500)); } return false; }
async function ensureServer() { if (await waitPort(1000)) return null; for (const bin of ['python', 'py']) { const p = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() }); if (await waitPort(15000)) return p; p.kill(); } return null; }

(async () => {
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const report = { results: [], consoleErrors: [] };
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 250)); });
    const step = (name, ok, detail) => report.results.push({ name, ok: !!ok, detail });

    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__panels && window.__diag && window.__statusBar), null, { timeout: 30000 });
        await page.evaluate(() => window.__setInputPanelOpen(false));
        await page.waitForTimeout(500);

        // S1 顶栏结构：品牌 + 分隔 + h1 分子名 + 主操作区；按钮 32 高、互不重叠、都在顶栏内
        const s1 = await page.evaluate(() => {
            const tb = document.getElementById('topbar');
            const r = (el) => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
            const btns = [...document.querySelectorAll('#topbar-actions .tb-btn')].map(b => ({ id: b.id, ...r(b), cls: b.className }));
            const brand = document.querySelector('#topbar .brand');
            const h1 = document.getElementById('molecule-name');
            return {
                bar: r(tb), btns,
                brandText: brand ? brand.textContent.trim() : '',
                brandTag: brand ? brand.tagName : '',
                h1Tag: h1 ? h1.tagName : '', h1Text: h1 ? h1.textContent.trim() : '',
                h1Size: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0,
                overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                ids: btns.map(b => b.id)
            };
        });
        const btnsOk = s1.btns.length >= 6 && s1.btns.every(b => b.h === 32 && b.t >= s1.bar.t && b.b <= s1.bar.b);
        let overlap = false;
        for (let i = 1; i < s1.btns.length; i++) if (s1.btns[i].l < s1.btns[i - 1].r - 1) overlap = true;
        step('S1 顶栏 44px：品牌 + h1 分子名 + 主操作按钮 32 高且互不重叠',
            s1.bar.h === 44 && s1.brandText === '球棍模型' && s1.brandTag !== 'H1' && s1.h1Tag === 'H1'
            && s1.h1Size === 16 && btnsOk && !overlap && s1.overflowX === 0
            && s1.ids.includes('btn-undo') && s1.ids.includes('btn-redo') && s1.ids.includes('btn-optimize-all')
            && s1.ids.includes('btn-clear-molecule') && s1.ids.includes('btn-open-input') && s1.ids.includes('btn-help'),
            { bar: s1.bar, brand: s1.brandText, h1: s1.h1Text + '/' + s1.h1Size, btns: s1.btns, overlap });

        // S2 三栏网格：224 / 自适应 / 224，8px 外边距、12px 间距；状态条 30px 在画布井底部
        const s2 = await page.evaluate(() => {
            const r = (id) => { const el = document.getElementById(id); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) }; };
            const shell = document.getElementById('shell');
            const cs = getComputedStyle(shell);
            return {
                build: r('build-panel'), well: r('well'), inspect: r('inspect-panel'),
                bar: r('status-bar'), canvasHost: r('canvas-host'),
                pad: cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft,
                gap: cs.columnGap, cols: cs.gridTemplateColumns,
                viewport: { w: innerWidth, h: innerHeight }
            };
        });
        step('S2 三栏网格：224 / 自适应 / 224、8px 边距、12px 间距、状态条 30px 贴井底',
            s2.build.w === 224 && s2.inspect.w === 224 && s2.build.x === 8 && s2.inspect.r === s2.viewport.w - 8
            && s2.well.x === s2.build.r + 12 && s2.inspect.x === s2.well.r + 12
            && s2.gap === '12px' && s2.pad === '12px 8px 8px 8px'
            && s2.bar.h === 30 && s2.bar.b === s2.well.b - 1 && s2.canvasHost.h === s2.well.h - 32,
            { build: s2.build, well: s2.well, inspect: s2.inspect, bar: s2.bar, pad: s2.pad, gap: s2.gap, cols: s2.cols });

        // S3 面板边界：1px 边框 + 8px 圆角 + 无阴影；抽屉贴右只靠 1px 左边线（重阴影检查项）
        const s3 = await page.evaluate(() => {
            const read = (id) => { const el = document.getElementById(id); if (!el) return null; const cs = getComputedStyle(el); return { border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor, borderLeft: cs.borderLeftWidth + ' ' + cs.borderLeftStyle + ' ' + cs.borderLeftColor, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow }; };
            return { inspect: read('inspect-panel'), group: read('group-sidebar'), atoms: read('sidebar'), drawer: read('input-panel') };
        });
        const cardOk = (o) => o && o.border === '1px solid rgb(35, 37, 43)' && o.radius === '8px' && o.shadow === 'none';
        const drawerOk = s3.drawer && s3.drawer.borderLeft === '1px solid rgb(35, 37, 43)' && s3.drawer.border.startsWith('0px none') && s3.drawer.radius === '0px' && s3.drawer.shadow === 'none';
        step('S3 面板/抽屉：1px 边框 + 8px 圆角 + 无阴影（不漂浮）',
            cardOk(s3.group) && cardOk(s3.atoms) && cardOk(s3.inspect) && drawerOk,
            s3);

        // S4 字号下限：可见文本 ≥ 11px（密集工具界面允许 11/12，禁止更小）
        const s4 = await page.evaluate(() => {
            const bad = [];
            const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let n;
            while ((n = walk.nextNode())) {
                const t = (n.textContent || '').trim();
                if (!t) continue;
                const el = n.parentElement;
                if (!el) continue;
                const cs = getComputedStyle(el);
                if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
                const fs = parseFloat(cs.fontSize);
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;
                if (fs < 11) bad.push({ text: t.slice(0, 16), fs, tag: el.tagName, cls: el.className });
            }
            return { bad: bad.slice(0, 10), count: bad.length };
        });
        step('S4 字号下限：所有可见文本 ≥ 11px', s4.count === 0, s4);

        // S5 空态：画布空态提示可见 + 状态条「空画布」；生成苯后读数齐全、提示隐藏
        const s5a = await page.evaluate(() => ({
            canvasEmpty: !document.getElementById('canvas-empty').hidden,
            canvasEmptyText: document.getElementById('canvas-empty').innerText.replace(/\n/g, ' '),
            statEmpty: (document.getElementById('stat-empty') || {}).hidden === false,
            statText: document.getElementById('status-bar').innerText.replace(/\n/g, ' ')
        }));
        await page.evaluate(() => window.__diag.generate('benzene'));
        await page.waitForTimeout(700);
        const s5b = await page.evaluate(() => ({
            canvasEmpty: !document.getElementById('canvas-empty').hidden,
            statEmptyHidden: (document.getElementById('stat-empty') || {}).hidden,
            bar: window.__statusBar(),
            barText: document.getElementById('status-bar').innerText.replace(/\n/g, ' '),
            nameDefault: window.__moleculeName(),
            nameAfter: (() => { window.__setMoleculeName('苯'); return window.__moleculeName(); })(),
            untitled: document.getElementById('molecule-name').classList.contains('untitled'),
            nameReset: (() => { window.__setMoleculeName(''); return window.__moleculeName(); })()
        }));
        step('S5 状态读数：空画布提示 → 苯 C₆H₆ / 12 原子 / 12 键 / 1 环 / 芳香 / ∠RMS',
            s5a.canvasEmpty && /画布为空/.test(s5a.canvasEmptyText) && s5a.statEmpty
            && !s5b.canvasEmpty && s5b.statEmptyHidden === true
            && s5b.bar.atoms === 12 && s5b.bar.bonds === 12 && s5b.bar.rings === 1 && s5b.bar.aromatic === 1
            && s5b.bar.formula === 'C6H6'
            && /C₆H₆/.test(s5b.barText) && /芳香/.test(s5b.barText) && /∠RMS/.test(s5b.barText)
            && s5b.nameDefault === '未命名分子' && s5b.nameAfter === '苯' && s5b.untitled === false && s5b.nameReset === '未命名分子',
            { empty: s5a, filled: s5b });

        // S6 检查器读数：点选碳原子 → 元素/杂化/成键数/键角 RMS；环一行
        const sp = await page.evaluate(() => {
            const a = window.__dragMode.atoms().find(x => x.t === 'C');
            return window.__dragMode.project(a.p[0], a.p[1], a.p[2]);
        });
        await page.mouse.click(sp.x, sp.y);
        await page.waitForTimeout(600);
        const s6 = await page.evaluate(() => ({
            hero: document.querySelector('#inspect-body .ins-hero') ? document.querySelector('#inspect-body .ins-hero').innerText.replace(/\n/g, ' ') : '',
            kvs: [...document.querySelectorAll('#inspect-body .kv')].map(k => k.innerText.replace(/\n/g, ' ')),
            rings: document.getElementById('ins-rings').innerText.replace(/\n/g, ' '),
            icon: !!document.querySelector('[title="删除选中原子"]')
        }));
        step('S6 检查器：点选碳显示元素/杂化/成键/键角，环段单行 6 元环·芳香',
            /^C/.test(s6.hero) && /sp2/.test(s6.hero) && s6.kvs.some(t => /成键/.test(t)) && s6.kvs.some(t => /键角 RMS/.test(t))
            && /6 元环/.test(s6.rings) && /芳香/.test(s6.rings) && s6.icon,
            s6);

        // S7 生成抽屉：360px 贴右、顶栏下方；开合只平移不挤压三栏
        const before = await page.evaluate(() => document.getElementById('well').getBoundingClientRect().width);
        await page.click('#btn-open-input');
        await page.waitForTimeout(500);
        const s7a = await page.evaluate(() => {
            const d = document.getElementById('input-panel'); const r = d.getBoundingClientRect();
            return { x: Math.round(r.x), w: Math.round(r.width), top: Math.round(r.top), h: Math.round(r.height), open: d.classList.contains('open'), vis: getComputedStyle(d).visibility, wellW: document.getElementById('well').getBoundingClientRect().width };
        });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        const s7b = await page.evaluate(() => {
            const d = document.getElementById('input-panel');
            return { open: d.classList.contains('open'), vis: getComputedStyle(d).visibility, wellW: document.getElementById('well').getBoundingClientRect().width };
        });
        step('S7 生成抽屉：360px 贴右、位于顶栏下方、开合为覆盖式（画布宽度不变）',
            s7a.w === 360 && s7a.x === 1440 - 360 && s7a.top === 44 && s7a.open && s7a.vis === 'visible'
            && Math.abs(s7a.wellW - before) < 1 && !s7b.open && Math.abs(s7b.wellW - before) < 1,
            { open: s7a, closed: s7b, before });

        // S8 旧角落控件已移除：guide/settings/#info 不存在；帮助浮层承载使用说明
        const s8 = await page.evaluate(() => ({
            guide: !!document.getElementById('guide-panel'),
            settings: !!document.getElementById('settings-panel'),
            info: !!document.getElementById('info'),
            helpCard: !!document.getElementById('help-card'),
            helpText: (document.getElementById('help-card') || {}).innerText || ''
        }));
        step('S8 七个角落控件已移除：使用说明并入帮助浮层',
            !s8.guide && !s8.settings && !s8.info && s8.helpCard && /拖动/.test(s8.helpText) && /快捷键/.test(s8.helpText),
            { guide: s8.guide, settings: s8.settings, info: s8.info, help: s8.helpCard });

        // S9 零 console 错误
        step('S9 零 console 错误', report.consoleErrors.length === 0, report.consoleErrors.slice(0, 5));
    } catch (e) {
        report.results.push({ name: 'FATAL', ok: false, detail: String(e && e.stack || e).slice(0, 900) });
    }

    const passed = report.results.filter(r => r.ok).length;
    report.summary = { total: report.results.length, passed, failed: report.results.length - passed };
    console.log(JSON.stringify(report, null, 2));
    console.log(`\n== verify_shell: ${passed}/${report.results.length} passed ==`);
    await browser.close();
    if (serverProc) serverProc.kill();
    process.exit(passed === report.results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
