// verify_animations.js — 浮层开合动画验证（2026-10-27 三栏重设计版）
// 覆盖：生成抽屉（右侧 360px）开合过渡、面板折叠（grid-template-columns 180ms）、
//       分子式小键盘（弹出动画、关闭瞬时）、异构体面板 / 键线式大图 / 帮助浮层 / 键菜单的淡入淡出、
//       手机底部抽屉开合、快速连点竞态、原生 select 点画布失焦、零 console 错误。
// 说明：旧版三个角落浮层（使用说明/设置/输入面板）已删除，相关 A1-A3 改为新外壳控件。
// 运行：cmd /c "node verify_animations.js > verify_animations.json 2>&1"（timeout 900000ms）
const { chromium } = require('playwright');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 8067;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=anim2`;

async function probe(url) { return new Promise(res => { const req = http.get(url, r => { r.resume(); res(true); }); req.on('error', () => res(false)); req.setTimeout(3000, () => { req.destroy(); res(false); }); }); }
async function waitPort(ms) { const dl = Date.now() + ms; while (Date.now() < dl) { if (await probe(`http://127.0.0.1:${PORT}/`)) return true; await new Promise(r => setTimeout(r, 500)); } return false; }
async function ensureServer() { if (await waitPort(1000)) return null; for (const bin of ['python', 'py']) { const p = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() }); if (await waitPort(15000)) return p; p.kill(); } return null; }

class AssertionCollector {
    constructor() { this.failed = 0; this.failures = []; }
    ok(cond, msg) { if (!cond) { this.failed++; this.failures.push(msg); } }
}

(async () => {
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1289, height: 896 } });
    const report = { results: [], consoleErrors: [] };
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 250)); });
    const push = (name, ok, detail) => report.results.push({ name, ok: !!ok, detail });
    const step = (name, ac, extra) => push(name, ac.failed === 0, [extra, ac.failures.join('；')].filter(Boolean).join(' | '));
    const t0 = Date.now();

    // 页面内快照：display / visibility / opacity / transform / 是否有运行中的动画 / class / pointer-events
    const snap = (id) => page.evaluate((eid) => {
        const el = document.getElementById(eid);
        if (!el) return { missing: true };
        const cs = getComputedStyle(el);
        return {
            display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
            transform: cs.transform, pointerEvents: cs.pointerEvents,
            anims: el.getAnimations().length,
            cls: el.className,
            inlineMaxH: el.style.maxHeight, inlineOverflow: el.style.overflow,
            open: el.classList.contains('open'), closing: el.classList.contains('dd-closing'),
            collapsed: el.classList.contains('collapsed'), sheetOpen: el.classList.contains('sheet-open')
        };
    }, id);
    const rectOf = (id) => page.evaluate((eid) => {
        const el = document.getElementById(eid);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
    }, id);

    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(
            () => !!(window.__diag && window.__ddAnim && window.__panels && window.__showFormulaKeypad
                && window.__showIsomerPanel && window.__openSkeletalLightbox && document.getElementById('formula-input')),
            null, { timeout: 30000 });
        await page.waitForTimeout(600);
        await page.evaluate(() => window.__setInputPanelOpen(false));
        await page.waitForTimeout(260);
        const IN = await page.evaluate(() => window.__ddAnim.inMs);
        const OUT = await page.evaluate(() => window.__ddAnim.outMs);

        // ---------- A1 生成抽屉：打开过渡（transform + visibility） ----------
        {
            const ac = new AssertionCollector();
            await page.click('#btn-open-input');
            const a = await snap('input-panel');
            await page.waitForTimeout(IN + 160);
            const b = await snap('input-panel');
            const rb = await rectOf('input-panel');
            ac.ok(a.open === true, `打开瞬间 .open 已置位（${a.cls}）`);
            ac.ok(a.anims >= 1, `打开瞬间有运行中的过渡（${a.anims}）`);
            ac.ok(b.visibility === 'visible', `过渡结束后可见（${b.visibility}）`);
            ac.ok(b.transform === 'matrix(1, 0, 0, 1, 0, 0)' || b.transform === 'none', `过渡结束后回到原位（${b.transform}）`);
            ac.ok(rb && rb.w === 360 && rb.x === 1289 - 360, `抽屉贴右 360px（x=${rb && rb.x} w=${rb && rb.w}）`);
            ac.ok(b.opacity === '1', `过渡结束不透明（${b.opacity}）`);
            step(`A1 生成抽屉打开过渡（${IN}ms transform+visibility）`, ac, `anims=${a.anims} transform=${b.transform}`);
        }

        // ---------- A2 生成抽屉：关闭过渡（visibility 延迟到结束才 hidden） ----------
        {
            const ac = new AssertionCollector();
            await page.click('#input-panel-toggle');
            const a = await snap('input-panel');
            await page.waitForTimeout(OUT + 160);
            const b = await snap('input-panel');
            ac.ok(a.open === false, `关闭瞬间 .open 已移除（${a.cls}）`);
            ac.ok(a.anims >= 1, `关闭瞬间有运行中的过渡（${a.anims}）`);
            ac.ok(a.visibility === 'visible', `关闭过渡期间仍可见（${a.visibility}）`);
            ac.ok(b.visibility === 'hidden', `过渡结束 visibility:hidden（${b.visibility}）`);
            ac.ok(/matrix\(1, 0, 0, 1, 360, 0\)/.test(b.transform), `过渡结束平移出屏（${b.transform}）`);
            step('A2 生成抽屉关闭过渡（190ms 后 visibility:hidden）', ac, `mid=${a.visibility} end=${b.visibility}`);
        }

        // ---------- A3 面板折叠：grid-template-columns 180ms 过渡 ----------
        {
            const ac = new AssertionCollector();
            const before = await rectOf('build-panel');
            await page.click('#group-sidebar-toggle');
            const a = await page.evaluate(() => ({
                anims: document.getElementById('shell').getAnimations().length,
                collapsed: document.getElementById('build-panel').classList.contains('collapsed'),
                bodyDisplay: getComputedStyle(document.getElementById('group-sidebar').querySelector('.panel-body')).display
            }));
            await page.waitForTimeout(360);
            const b = await rectOf('build-panel');
            const caret = await page.evaluate(() => {
                const svg = document.querySelector('#group-sidebar .panel-caret svg[data-icon]');
                return svg ? svg.dataset.icon : null;
            });
            await page.click('#group-sidebar-toggle');
            await page.waitForTimeout(360);
            const c = await rectOf('build-panel');
            ac.ok(a.collapsed === true, `收起瞬间 .collapsed 已置位`);
            ac.ok(a.anims >= 1, `收起瞬间 shell 有列宽过渡（${a.anims}）`);
            ac.ok(b.w === 44, `收起后构建台 44px 轨道（${b.w}）`);
            ac.ok(a.bodyDisplay === 'none', `收起后内容区隐藏（${a.bodyDisplay}）`);
            ac.ok(caret === 'chevron-right', `收起后 caret 指向展开方向（${caret}）`);
            ac.ok(c.w === 224 && c.w === before.w, `再展开回到 224px（${c.w}）`);
            step('A3 面板折叠 180ms 列宽过渡（224 ↔ 44）', ac, `before=${before.w} collapsed=${b.w} after=${c.w}`);
        }

        // ---------- A4 分子式小键盘：弹出有动画，关闭瞬时 ----------
        {
            const ac = new AssertionCollector();
            await page.evaluate(() => window.__showFormulaKeypad());
            const a = await snap('formula-keypad');
            await page.waitForTimeout(IN + 140);
            const b = await snap('formula-keypad');
            await page.evaluate(() => window.__hideFormulaKeypad());
            const c = await snap('formula-keypad');
            ac.ok(a.display === 'block' && a.anims >= 1, `弹出瞬间可见 + 动画（${a.display}/${a.anims}）`);
            ac.ok(b.display === 'block' && b.opacity === '1', `弹出完成（${b.display}/${b.opacity}）`);
            ac.ok(c.display === 'none', `关闭保持瞬时（${c.display}）`);
            step('A4 小键盘弹出动画 + 关闭瞬时', ac);
        }

        // ---------- A5 异构体面板 ----------
        {
            const ac = new AssertionCollector();
            await page.evaluate(() => window.__showIsomerPanel('C2H6O', [
                { cid: 702, name: 'ethanol', formula: 'C2H6O', smiles: 'CCO', cond: 'CH₃CH₂OH' },
                { cid: 8254, name: 'dimethyl ether', formula: 'C2H6O', smiles: 'COC', cond: 'CH₃OCH₃' }
            ]));
            const a = await snap('isomer-panel');
            await page.waitForTimeout(IN + 160);
            const b = await snap('isomer-panel');
            await page.evaluate(() => window.__hideIsomerPanel());
            const c = await snap('isomer-panel');
            await page.waitForTimeout(OUT + 160);
            const d = await snap('isomer-panel');
            ac.ok(a.display === 'flex' && a.anims >= 1, `显示瞬间 flex + 动画（${a.display}/${a.anims}）`);
            ac.ok(b.display === 'flex' && b.opacity === '1', `淡入完成（${b.display}/${b.opacity}）`);
            ac.ok(c.display === 'flex' && c.pointerEvents === 'none', `淡出期间仍可见且不接收点击（${c.display}/${c.pointerEvents}）`);
            ac.ok(d.display === 'none', `淡出完成 display:none（${d.display}）`);
            ac.ok(d.pointerEvents === 'auto', `淡出完成后恢复点击（${d.pointerEvents}）`);
            step('A5 异构体面板淡入/淡出', ac);
        }

        // ---------- A6 键线式大图 ----------
        {
            const ac = new AssertionCollector();
            await page.evaluate(() => window.__openSkeletalLightbox({ cid: 702, name: 'ethanol', formula: 'C2H6O', smiles: 'CCO', cond: 'CH₃CH₂OH' }));
            const a = await snap('skeletal-lightbox');
            const ac2 = await snap('skeletal-lightbox-card');
            await page.waitForTimeout(IN + 160);
            const b = await snap('skeletal-lightbox');
            await page.evaluate(() => window.__hideSkeletalLightbox());
            const c = await snap('skeletal-lightbox');
            await page.waitForTimeout(OUT + 160);
            const d = await snap('skeletal-lightbox');
            ac.ok(a.display === 'flex' && a.anims >= 1, `打开瞬间 flex + 动画（${a.display}/${a.anims}）`);
            ac.ok(ac2.anims >= 1, `卡片同时播放动画（${ac2.anims}）`);
            ac.ok(b.display === 'flex' && b.opacity === '1', `淡入完成（${b.display}/${b.opacity}）`);
            ac.ok(c.display === 'flex', `淡出期间仍可见（${c.display}）`);
            ac.ok(d.display === 'none', `淡出完成 display:none（${d.display}）`);
            step('A6 键线式大图淡入/淡出', ac);
        }

        // ---------- A7 帮助浮层 ----------
        {
            const ac = new AssertionCollector();
            await page.click('#btn-help');
            const a = await snap('help-overlay');
            await page.waitForTimeout(IN + 160);
            const b = await snap('help-overlay');
            await page.click('#help-close');
            const c = await snap('help-overlay');
            await page.waitForTimeout(OUT + 160);
            const d = await snap('help-overlay');
            ac.ok(a.display === 'flex' && a.anims >= 1, `打开瞬间 flex + 动画（${a.display}/${a.anims}）`);
            ac.ok(b.display === 'flex' && b.opacity === '1', `淡入完成（${b.display}/${b.opacity}）`);
            ac.ok(c.display === 'flex', `淡出期间仍可见（${c.display}）`);
            ac.ok(d.display === 'none', `淡出完成 display:none（${d.display}）`);
            step('A7 帮助浮层淡入/淡出', ac);
        }

        // ---------- A8 键菜单（debug 入口 + 真实鼠标点击键） ----------
        {
            const ac = new AssertionCollector();
            await page.evaluate(() => window.__ddAnim.bondMenu.show());
            const a = await snap('bond-type-menu');
            await page.waitForTimeout(IN + 160);
            const b = await page.evaluate(() => {
                const m = document.getElementById('bond-type-menu');
                return { display: getComputedStyle(m).display, tf: getComputedStyle(m).transform };
            });
            await page.evaluate(() => window.__ddAnim.bondMenu.hide());
            const c = await snap('bond-type-menu');
            await page.waitForTimeout(OUT + 160);
            const d = await snap('bond-type-menu');
            ac.ok(a.display === 'flex' && a.anims >= 1, `显示瞬间 flex + 动画（${a.display}/${a.anims}）`);
            ac.ok(b.display === 'flex' && b.tf !== 'none', `动画结束后保留居中 transform（${b.tf}）`);
            ac.ok(c.display === 'flex' && c.pointerEvents === 'none', `淡出期间仍可见且不接收点击（${c.display}/${c.pointerEvents}）`);
            ac.ok(d.display === 'none', `淡出完成 display:none（${d.display}）`);

            // 真实鼠标：生成乙烷 → 点 C—C 键中点 → 菜单带弹出动画
            const mid = await page.evaluate(() => {
                window.__diag.generate('ethane');
                window.__fitView && window.__fitView();
                const ats = window.__dragMode.atoms();
                const c = ats.filter(a => a.t === 'C');
                if (c.length < 2) return null;
                const p = [0, 1, 2].map(i => (c[0].p[i] + c[1].p[i]) / 2);
                return window.__dragMode.project(p[0], p[1], p[2]);
            });
            let real = { ok: false, detail: 'no-mid' };
            if (mid) {
                await page.mouse.click(mid.x, mid.y);
                const r = await snap('bond-type-menu');
                real = { ok: r.display === 'flex' && r.anims >= 1, detail: `${r.display}/${r.anims}` };
                await page.keyboard.press('Escape');
                await page.mouse.click(20, 700);
                await page.waitForTimeout(OUT + 120);
            }
            ac.ok(real.ok, `真实点击键弹出菜单并播放动画（${real.detail}）`);
            step('A8 键菜单淡入/淡出 + 真实点击', ac);
        }

        // ---------- A9 快速连点竞态：收起未播完又打开，不得被旧状态覆盖 ----------
        {
            const ac = new AssertionCollector();
            // 生成抽屉：开 → 关 → 立刻再开
            await page.evaluate(() => {
                window.__setInputPanelOpen(true);
                window.__setInputPanelOpen(false);
                window.__setInputPanelOpen(true);
            });
            await page.waitForTimeout(OUT + IN + 260);
            const i = await snap('input-panel');
            ac.ok(i.open === true && i.visibility === 'visible'
                && (i.transform === 'matrix(1, 0, 0, 1, 0, 0)' || i.transform === 'none'),
                `抽屉连点后仍展开（${i.cls} / ${i.visibility} / ${i.transform}）`);
            await page.evaluate(() => window.__setInputPanelOpen(false));
            await page.waitForTimeout(OUT + 140);

            // 构建台：收起 → 立刻展开
            await page.click('#group-sidebar-toggle');
            await page.click('#group-sidebar-toggle');
            await page.waitForTimeout(420);
            const b = await snap('build-panel');
            const br = await rectOf('build-panel');
            ac.ok(b.collapsed === false && br.w === 224, `面板连点后仍展开（collapsed=${b.collapsed} w=${br.w}）`);
            step('A9 过渡未播完又打开的竞态', ac, `drawer=${i.transform} build=${br.w}`);
        }

        // ---------- A10 原生 select 的「点别处收起」未被动画影响 ----------
        {
            const ac = new AssertionCollector();
            await page.focus('#atom-style-select');
            const f1 = await page.evaluate(() => document.activeElement && document.activeElement.id);
            await page.mouse.click(700, 500);
            await page.waitForTimeout(200);
            const f2 = await page.evaluate(() => document.activeElement && document.activeElement.id);
            const ins = await page.evaluate(() => ({
                body: getComputedStyle(document.getElementById('inspect-body')).display,
                panel: getComputedStyle(document.getElementById('inspect-panel')).display
            }));
            ac.ok(f1 === 'atom-style-select', `select 获得焦点（${f1}）`);
            ac.ok(f2 !== 'atom-style-select', `点画布后 select 失焦（${f2}）`);
            ac.ok(ins.body !== 'none' && ins.panel !== 'none', `检查器常驻不被收起（body=${ins.body}）`);
            step('A10 原生 select 失焦（检查器常驻）', ac);
        }

        // ---------- A11 手机底部抽屉开合过渡 ----------
        {
            const ac = new AssertionCollector();
            await page.setViewportSize({ width: 390, height: 844 });
            await page.waitForTimeout(400);
            await page.click('#mb-build');
            const a = await page.evaluate(() => ({
                anims: document.getElementById('build-panel').getAnimations().length,
                open: document.getElementById('build-panel').classList.contains('sheet-open'),
                vis: getComputedStyle(document.getElementById('build-panel')).visibility
            }));
            await page.waitForTimeout(360);
            const b = await page.evaluate(() => {
                const p = document.getElementById('build-panel');
                const cs = getComputedStyle(p);
                const r = p.getBoundingClientRect();
                return { tf: cs.transform, vis: cs.visibility, y: Math.round(r.y), b: Math.round(r.bottom) };
            });
            await page.click('#mb-build');
            await page.waitForTimeout(360);
            const c = await page.evaluate(() => {
                const p = document.getElementById('build-panel');
                const cs = getComputedStyle(p);
                return { open: p.classList.contains('sheet-open'), vis: cs.visibility, tf: cs.transform };
            });
            ac.ok(a.open === true, `打开瞬间 .sheet-open 已置位`);
            ac.ok(a.anims >= 1, `打开瞬间有过渡（${a.anims}）`);
            ac.ok(b.vis === 'visible' && (b.tf === 'none' || b.tf === 'matrix(1, 0, 0, 1, 0, 0)'), `打开完成贴底可见（${b.vis}/${b.tf}）`);
            ac.ok(b.b <= 844 - 50 && b.y > 100, `抽屉停在底部栏上方（y=${b.y} b=${b.b}）`);
            ac.ok(c.open === false && c.vis === 'hidden' && c.tf !== 'none', `再点收起（${c.vis}/${c.tf}）`);
            step('A11 手机底部抽屉开合过渡（translateY + visibility）', ac, `open=${b.tf} closed=${c.tf}`);
        }

        // ---------- A12 零 console / pageerror ----------
        push('A12 零 console 错误', report.consoleErrors.length === 0, report.consoleErrors.slice(0, 3).join(' | ') || 'clean');

    } catch (e) {
        push('FATAL', false, String(e && e.stack ? e.stack : e).slice(0, 600));
    }

    report.durationMs = Date.now() - t0;
    report.passed = report.results.filter(r => r.ok).length;
    report.total = report.results.length;
    console.log(JSON.stringify(report, null, 2));
    console.log(`\nRESULT: ${report.passed}/${report.total} ${report.passed === report.total ? 'ALL PASS' : 'FAILED'}`);
    await browser.close();
    if (serverProc) serverProc.kill();
    process.exit(report.passed === report.total ? 0 : 1);
})();
