// verify_animations.js — 浮层开合动画验证（2026-10-25）
// 覆盖：使用说明 / 设置 / 名称·SMILES 三个角落浮层的展开（高度+淡入）与收起（延迟 display:none）、
//       分子式小键盘（弹出动画、关闭瞬时）、异构体面板 / 键线式大图 / 帮助浮层 / 键菜单的淡入淡出、
//       收起中间态 pointer-events:none、快速连点竞态（收起动画未播完又打开不得被藏掉）、零 console 错误。
// 运行：cmd /c "node verify_animations.js > verify_animations.json 2>&1"（timeout 900000ms）
const { chromium } = require('playwright');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 8067;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=anim1`;

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

    // 页面内快照：display / opacity / 是否有运行中的动画 / class / pointer-events
    const snap = (id) => page.evaluate((eid) => {
        const el = document.getElementById(eid);
        if (!el) return { missing: true };
        const cs = getComputedStyle(el);
        return {
            display: cs.display, opacity: cs.opacity, pointerEvents: cs.pointerEvents,
            anims: el.getAnimations().length,
            cls: el.className,
            inlineMaxH: el.style.maxHeight, inlineOverflow: el.style.overflow,
            open: el.classList.contains('open'), closing: el.classList.contains('dd-closing')
        };
    }, id);

    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(
            () => !!(window.__diag && window.__ddAnim && window.__showFormulaKeypad && window.__showIsomerPanel
                && window.__openSkeletalLightbox && document.getElementById('formula-input')),
            null, { timeout: 30000 });
        await page.waitForTimeout(600);
        await page.evaluate(() => window.__setInputPanelOpen(false, { animate: false }));
        await page.waitForTimeout(120);
        const IN = await page.evaluate(() => window.__ddAnim.inMs);
        const OUT = await page.evaluate(() => window.__ddAnim.outMs);

        // ---------- A1 使用说明：展开动画 ----------
        {
            const ac = new AssertionCollector();
            await page.click('#guide-toggle');
            const a = await snap('guide-body');
            await page.waitForTimeout(IN + 140);
            const b = await snap('guide-body');
            ac.ok(a.display === 'block', `展开瞬间即可见（${a.display}）`);
            ac.ok(a.open === true, `展开瞬间 .open 已置位（${a.cls}）`);
            ac.ok(a.anims >= 1, `展开瞬间有运行中的动画（${a.anims}）`);
            ac.ok(b.display === 'block', `动画结束后仍可见（${b.display}）`);
            ac.ok(b.opacity === '1', `动画结束后完全不透明（${b.opacity}）`);
            ac.ok(b.inlineMaxH === '' && b.inlineOverflow === '', `动画结束后清理内联 maxHeight/overflow（"${b.inlineMaxH}"/"${b.inlineOverflow}"）`);
            step(`A1 使用说明展开动画（${IN}ms 高度+淡入）`, ac, `anims=${a.anims}`);
        }

        // ---------- A2 使用说明：收起动画（延迟 display:none）----------
        {
            const ac = new AssertionCollector();
            await page.click('#guide-toggle');
            const a = await snap('guide-body');
            await page.waitForTimeout(OUT + 140);
            const b = await snap('guide-body');
            ac.ok(a.open === false, `收起瞬间 .open 已移除（${a.cls}）`);
            ac.ok(a.closing === true, `收起瞬间处于 .dd-closing 中间态（${a.cls}）`);
            ac.ok(a.display !== 'none', `收起动画期间仍可见（${a.display}）`);
            ac.ok(a.pointerEvents === 'none', `收起动画期间不接收点击（${a.pointerEvents}）`);
            ac.ok(b.display === 'none', `动画结束后 display:none（${b.display}）`);
            ac.ok(b.closing === false, `动画结束后 .dd-closing 已摘除（${b.cls}）`);
            step(`A2 使用说明收起动画（${OUT}ms 后 display:none）`, ac, `mid=${a.display} end=${b.display}`);
        }

        // ---------- A3 设置面板（display:flex 变体）----------
        {
            const ac = new AssertionCollector();
            await page.click('#settings-toggle');
            const a = await snap('settings-body');
            await page.waitForTimeout(IN + 140);
            const b = await snap('settings-body');
            await page.click('#settings-toggle');
            const c = await snap('settings-body');
            await page.waitForTimeout(OUT + 140);
            const d = await snap('settings-body');
            ac.ok(a.display === 'flex' && a.anims >= 1, `展开瞬间 flex + 动画（${a.display}/${a.anims}）`);
            ac.ok(b.display === 'flex' && b.opacity === '1', `展开完成（${b.display}/${b.opacity}）`);
            ac.ok(c.display === 'flex' && c.closing === true, `收起期间仍可见（${c.display}/${c.cls}）`);
            ac.ok(d.display === 'none', `收起完成 display:none（${d.display}）`);
            step('A3 设置面板展开/收起动画', ac);
        }

        // ---------- A4 名称 / SMILES 输入面板 ----------
        {
            const ac = new AssertionCollector();
            await page.evaluate(() => window.__setInputPanelOpen(true));
            const a = await snap('input-panel-body');
            await page.waitForTimeout(IN + 140);
            const b = await snap('input-panel-body');
            await page.evaluate(() => window.__setInputPanelOpen(false));
            const c = await snap('input-panel-body');
            await page.waitForTimeout(OUT + 140);
            const d = await snap('input-panel-body');
            ac.ok(a.display !== 'none' && a.anims >= 1, `展开瞬间可见 + 动画（${a.display}/${a.anims}）`);
            ac.ok(b.display !== 'none' && b.opacity === '1', `展开完成（${b.display}/${b.opacity}）`);
            ac.ok(c.display !== 'none', `收起期间仍可见（${c.display}）`);
            ac.ok(d.display === 'none', `收起完成 display:none（${d.display}）`);
            step('A4 输入面板展开/收起动画', ac);
        }

        // ---------- A5 分子式小键盘：弹出有动画，关闭瞬时 ----------
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
            step('A5 小键盘弹出动画 + 关闭瞬时', ac);
        }

        // ---------- A6 异构体面板 ----------
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
            step('A6 异构体面板淡入/淡出', ac);
        }

        // ---------- A7 键线式大图 ----------
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
            step('A7 键线式大图淡入/淡出', ac);
        }

        // ---------- A8 帮助浮层 ----------
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
            step('A8 帮助浮层淡入/淡出', ac);
        }

        // ---------- A9 键菜单（debug 入口 + 真实鼠标点击键）----------
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
            step('A9 键菜单淡入/淡出 + 真实点击', ac);
        }

        // ---------- A10 快速连点竞态：收起未播完又打开，不得被旧回调藏掉 ----------
        {
            const ac = new AssertionCollector();
            // 使用说明：展开 → 收起 → 立刻再展开
            await page.click('#guide-toggle');           // open
            await page.click('#guide-toggle');           // close（开始 120ms 收起动画）
            await page.click('#guide-toggle');           // 立刻 open
            await page.waitForTimeout(OUT + IN + 220);
            const g = await snap('guide-body');
            ac.ok(g.display === 'block' && g.open === true && g.closing === false,
                `连点后仍展开（${g.display}/${g.cls}）`);
            await page.click('#guide-toggle');
            await page.waitForTimeout(OUT + 160);

            // 输入面板：关闭 → 立刻打开
            await page.evaluate(() => { window.__setInputPanelOpen(true); window.__setInputPanelOpen(false); window.__setInputPanelOpen(true); });
            await page.waitForTimeout(OUT + IN + 220);
            const i = await snap('input-panel-body');
            ac.ok(i.display !== 'none', `输入面板连点后仍可见（${i.display}）`);
            await page.evaluate(() => window.__setInputPanelOpen(false, { animate: false }));
            step('A10 收起动画未播完又打开的竞态', ac, `guide=${g.display} input=${i.display}`);
        }

        // ---------- A11 原生 select 的「点别处收起」未被动画影响 ----------
        {
            const ac = new AssertionCollector();
            await page.click('#settings-toggle');
            await page.waitForTimeout(IN + 140);
            await page.focus('#atom-style-select');
            const f1 = await page.evaluate(() => document.activeElement && document.activeElement.id);
            await page.mouse.click(700, 500);
            await page.waitForTimeout(160);
            const f2 = await page.evaluate(() => document.activeElement && document.activeElement.id);
            const s = await snap('settings-body');
            ac.ok(f1 === 'atom-style-select', `select 获得焦点（${f1}）`);
            ac.ok(f2 !== 'atom-style-select', `点画布后 select 失焦（${f2}）`);
            ac.ok(s.display === 'none', `点画布后设置面板收起（${s.display}）`);
            step('A11 原生 select 失焦 + 面板收起', ac);
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
