// verify_history.js — 撤销/恢复（快照式历史）真实验证（2026-10-18）
// 覆盖：按钮/图标/布局/初始置灰、空栈提示、拖拽新原子、Delete 键与垃圾桶图标删除、
//       拖动移动的位置精确还原、键盘微移合并（debounce）、生成（复合操作恰一条）、
//       新操作清空 redo、Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y、清空按钮、优化提交、零 console 错误。
// 运行：cmd /c "node verify_history.js > verify_history.json 2>&1"（timeout 900000ms）
const { chromium } = require('playwright-core');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 8053;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=hist1`;

function probe(url) {
    return new Promise((resolve) => {
        const req = http.get(url, { timeout: 2500 }, (res) => {
            res.resume();
            resolve(res.statusCode >= 200 && res.statusCode < 500);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
    });
}

async function waitPort(ms) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        if (await probe(`http://127.0.0.1:${PORT}/`)) return true;
        await new Promise(r => setTimeout(r, 500));
    }
    return false;
}

async function ensureServer() {
    if (await waitPort(1000)) return null;
    for (const bin of ['python', 'py']) {
        const proc = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() });
        const ready = await waitPort(15000);
        if (ready) return proc;
        proc.kill();
    }
    return null;
}

class AssertionCollector {
    constructor() { this.passed = 0; this.failed = 0; this.failures = []; }
    ok(cond, label) {
        if (cond) this.passed++;
        else { this.failed++; this.failures.push(label); }
    }
}

// 位置多重集合匹配（容差 tol，顺序无关）
function posMatch(before, after, tol = 0.005) {
    if (before.length !== after.length) return { ok: false, reason: `count ${before.length} vs ${after.length}` };
    const used = new Array(after.length).fill(false);
    for (const b of before) {
        let hit = -1;
        for (let j = 0; j < after.length; j++) {
            if (used[j]) continue;
            const a = after[j];
            if (Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) + Math.abs(b[2] - a[2]) <= tol) { hit = j; break; }
        }
        if (hit < 0) return { ok: false, reason: 'unmatched ' + JSON.stringify(b) };
        used[hit] = true;
    }
    return { ok: true };
}

(async () => {
    const t0 = Date.now();
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const report = { passed: 0, failed: 0, total: 0, results: [], consoleErrors: [], elapsedMs: 0 };

    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });

    const push = (name, pass, detail) => {
        report.total++; pass ? report.passed++ : report.failed++;
        report.results.push({ name, pass, detail });
    };

    const readState = () => page.evaluate(() => ({
        n: window.__dragMode.atoms().length,
        nb: window.__diag.bonds().length,
        pos: window.__dragMode.atoms().map(a => a.p),
        depth: window.__history.depth(),
        toast: (document.getElementById('toast-message') || {}).textContent || '',
    }));
    const clickUndo = async () => { await page.click('#btn-undo'); await page.waitForTimeout(340); };
    const clickRedo = async () => { await page.click('#btn-redo'); await page.waitForTimeout(340); };
    const dragNewCarbon = async (tx, ty) => {
        const card = await page.evaluate(() => {
            const c = document.querySelector('#drag-carbon');
            const r = c.getBoundingClientRect();
            return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        });
        await page.mouse.move(card.x, card.y);
        await page.mouse.down();
        await page.mouse.move(tx, ty, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(450);
    };
    const atomScreen = async (idx = 0) => page.evaluate((i) => {
        const a = window.__dragMode.atoms()[i];
        return window.__dragMode.project(a.p[0], a.p[1], a.p[2]);
    }, idx);

    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(
            () => !!(window.__history && window.__dragMode && window.__diag && window.__setInputPanelOpen),
            null, { timeout: 30000 });
        await page.evaluate(() => {
            try { window.__setInputPanelOpen(false); } catch (e) {}
            window.__history.reset();
        });
        await page.waitForTimeout(250);

        // ---------- H1 按钮：图标水合 / 标签 / 布局 / 初始置灰 ----------
        {
            const h1 = await page.evaluate(() => {
                const u = document.getElementById('btn-undo'), r = document.getElementById('btn-redo');
                const cl = document.getElementById('btn-clear-molecule');
                const rb = (el) => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), h: Math.round(b.height) }; };
                const iconPaths = (el, name) => { const s = el.querySelector('svg[data-icon="' + name + '"]'); return s ? s.querySelectorAll('path').length : 0; };
                const label = u.querySelector('.corner-label');
                return {
                    ub: rb(u), rb2: rb(r), clb: rb(cl),
                    labelOverflow: label ? label.scrollWidth > label.clientWidth + 1 : false,
                    uCls: u.className, rCls: r.className,
                    uIcon: iconPaths(u, 'undo-2'), rIcon: iconPaths(r, 'redo-2'),
                    uLabel: (u.querySelector('.corner-label') || {}).textContent || '',
                    rLabel: (r.querySelector('.corner-label') || {}).textContent || '',
                    uTitle: u.getAttribute('title') || '', rTitle: r.getAttribute('title') || '',
                    uEmpty: u.classList.contains('hist-empty'), rEmpty: r.classList.contains('hist-empty'),
                    depth: window.__history.depth()
                };
            });
            const ac = new AssertionCollector();
            ac.ok(h1.uIcon === 2 && h1.rIcon === 2, `图标水合（undo-2/redo-2 各 2 条 path，实际 ${h1.uIcon}/${h1.rIcon}）`);
            ac.ok(h1.uLabel === '撤销' && h1.rLabel === '恢复', `标签（${h1.uLabel}/${h1.rLabel}）`);
            ac.ok(/Ctrl\+Z/i.test(h1.uTitle) && /Ctrl\+Y/i.test(h1.rTitle), `title 含快捷键说明（"${h1.uTitle}" / "${h1.rTitle}"）`);
            ac.ok(h1.ub.t === 20 && h1.rb2.t === 20 && h1.ub.h === 32 && h1.rb2.h === 32, `与角落控件同行同高（t=${h1.ub.t}/${h1.rb2.t} h=${h1.ub.h}/${h1.rb2.h}）`);
            ac.ok(h1.ub.l >= h1.clb.r && h1.ub.r <= h1.rb2.l, `排在清空右侧且互不重叠（清空右缘 ${h1.clb.r} / 撤销 ${h1.ub.l}-${h1.ub.r} / 恢复 ${h1.rb2.l}-${h1.rb2.r}）`);
            ac.ok(!h1.labelOverflow, '按钮文字未被挤压溢出');
            ac.ok(h1.uCls.includes('corner-widget') && h1.uCls.includes('corner-head') && h1.rCls.includes('corner-widget') && h1.rCls.includes('corner-head'), '统一角落控件结构（corner-widget corner-head）');
            ac.ok(h1.uEmpty && h1.rEmpty && h1.depth.undo === 0 && h1.depth.redo === 0, `初始空栈置灰（depth=${JSON.stringify(h1.depth)}）`);
            push('H1 撤销/恢复按钮：图标/标签/布局/初始置灰', ac.failed === 0,
                JSON.stringify({ ub: h1.ub, rb: h1.rb2, clb: h1.clb, depth: h1.depth }) + ' | ' + ac.failures.join('；'));
        }

        // ---------- H2 空栈真实点击：toast 提示且无副作用 ----------
        {
            await page.click('#btn-undo');
            await page.waitForTimeout(250);
            const a = await readState();
            await page.click('#btn-redo');
            await page.waitForTimeout(250);
            const b = await readState();
            const ac = new AssertionCollector();
            ac.ok(/没有可撤销的操作/.test(a.toast), `撤销空栈 toast（"${a.toast}"）`);
            ac.ok(/没有可恢复的操作/.test(b.toast), `恢复空栈 toast（"${b.toast}"）`);
            ac.ok(a.depth.undo === 0 && b.depth.redo === 0 && b.n === 0, '空操作后栈/分子均无变化');
            push('H2 空栈点击：toast 提示且无副作用', ac.failed === 0,
                JSON.stringify({ a: a.toast, b: b.toast }) + ' | ' + ac.failures.join('；'));
        }

        // ---------- H3 拖拽新原子 → 撤销移除 / 恢复回来 ----------
        {
            await dragNewCarbon(640, 400);
            const s1 = await readState();
            const undoEmptyAfter = await page.evaluate(() => document.getElementById('btn-undo').classList.contains('hist-empty'));
            await clickUndo();
            const s2 = await readState();
            await clickRedo();
            const s3 = await readState();
            const m13 = posMatch(s1.pos, s3.pos, 0.01);
            const ac = new AssertionCollector();
            ac.ok(s1.n === 1, `拖出新原子（n=${s1.n}）`);
            ac.ok(s1.depth.undo === 1 && s1.depth.redo === 0, `提交恰一条（depth=${JSON.stringify(s1.depth)}）`);
            ac.ok(!undoEmptyAfter, '撤销按钮脱离置灰态（hist-empty 移除）');
            ac.ok(s2.n === 0 && s2.depth.undo === 0 && s2.depth.redo === 1, `撤销后原子移除（n=${s2.n}, depth=${JSON.stringify(s2.depth)}）`);
            ac.ok(s3.n === 1 && m13.ok, `恢复后原子回来且位置一致（${JSON.stringify(m13)}）`);
            push('H3 拖拽新原子：撤销移除 / 恢复回来', ac.failed === 0,
                JSON.stringify({ s1: s1.depth, s2: s2.depth, s3: s3.depth }) + ' | ' + ac.failures.join('；'));
        }

        // ---------- H4 Delete 键与垃圾桶图标删除均可撤销 ----------
        {
            const sp = await atomScreen(0);
            await page.mouse.click(sp.x, sp.y);
            await page.waitForTimeout(400);
            const sel = await page.evaluate(() => !!document.querySelector('[title="删除选中原子"]'));
            await page.keyboard.press('Delete');
            await page.waitForTimeout(350);
            const d1 = await readState();
            await clickUndo();
            const d2 = await readState();
            await clickRedo();
            const d3 = await readState();
            // 垃圾桶图标路径：先撤销回来 → 选中 → 点图标删除 → 再撤销
            await clickUndo();
            await page.mouse.click(sp.x, sp.y);
            await page.waitForTimeout(400);
            const icon = await page.evaluate(() => {
                const el = document.querySelector('[title="删除选中原子"]');
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            });
            if (icon) { await page.mouse.click(icon.x, icon.y); await page.waitForTimeout(400); }
            const t1 = await readState();
            await clickUndo();
            const t2 = await readState();
            const ac = new AssertionCollector();
            ac.ok(sel, '点选原子出现删除图标');
            ac.ok(d1.n === 0 && d1.depth.undo === 2, `Delete 键删除（n=${d1.n}, depth=${JSON.stringify(d1.depth)}）`);
            ac.ok(d2.n === 1 && d2.depth.undo === 1 && d2.depth.redo === 1, `撤销删除（n=${d2.n}, depth=${JSON.stringify(d2.depth)}）`);
            ac.ok(d3.n === 0, `重做删除（n=${d3.n}）`);
            ac.ok(!!icon, '垃圾桶图标可定位');
            ac.ok(t1.n === 0 && t1.depth.undo === 2, `垃圾桶图标删除（n=${t1.n}, depth=${JSON.stringify(t1.depth)}）`);
            ac.ok(t2.n === 1, `垃圾桶图标删除可撤销（n=${t2.n}）`);
            push('H4 Delete 键与垃圾桶图标删除均可撤销', ac.failed === 0,
                JSON.stringify({ d1: d1.depth, d2: d2.depth, t1: t1.depth }) + ' | ' + ac.failures.join('；'));
        }

        // ---------- H5 拖动已有原子：撤销位置精确还原 / 恢复回到拖动后位置 ----------
        {
            const before = (await readState()).pos;
            const sp = await atomScreen(0);
            await page.mouse.move(sp.x, sp.y);
            await page.mouse.down();
            await page.mouse.move(sp.x + 150, sp.y + 80, { steps: 10 });
            await page.mouse.up();
            await page.waitForTimeout(450);
            const s1 = await readState();
            const moved = Math.abs(s1.pos[0][0] - before[0][0]) + Math.abs(s1.pos[0][1] - before[0][1]) + Math.abs(s1.pos[0][2] - before[0][2]);
            await clickUndo();
            const s2 = await readState();
            await clickRedo();
            const s3 = await readState();
            const r2 = posMatch(before, s2.pos, 0.005);
            const r3 = posMatch(s1.pos, s3.pos, 0.005);
            const ac = new AssertionCollector();
            ac.ok(s1.n === 1 && moved > 0.2, `拖动改变位置（Δ=${moved.toFixed(3)}Å）`);
            ac.ok(s1.depth.undo === 2 && s1.depth.redo === 0, `拖动提交一条（depth=${JSON.stringify(s1.depth)}，新动作已清空 redo）`);
            ac.ok(s2.depth.undo === 1 && s2.depth.redo === 1, `撤销后栈平衡（depth=${JSON.stringify(s2.depth)}）`);
            ac.ok(s2.n === 1 && r2.ok, `撤销后位置精确还原到拖动前（${JSON.stringify(r2)}）`);
            ac.ok(r3.ok, `恢复后回到拖动后位置（${JSON.stringify(r3)}）`);
            push('H5 拖动已有原子：撤销精确还原 / 恢复', ac.failed === 0,
                JSON.stringify({ moved: +moved.toFixed(3), s1: s1.depth, s2: s2.depth }) + ' | ' + ac.failures.join('；'));
        }

        // ---------- H6 键盘微移：三次连按合并为一条（debounce），撤销还原 ----------
        {
            await page.evaluate(() => window.__history.reset());
            const k0 = (await readState()).pos;
            const sp = await atomScreen(0);
            await page.mouse.click(sp.x, sp.y);
            await page.waitForTimeout(350);
            await page.keyboard.press('x');
            await page.waitForTimeout(80);
            await page.keyboard.press('x');
            await page.waitForTimeout(80);
            await page.keyboard.press('x');
            await page.waitForTimeout(750);   // > 400ms debounce
            const s1 = await readState();
            await clickUndo();
            const s2 = await readState();
            const dx = Math.abs(s1.pos[0][0] - k0[0][0]);
            const r2 = posMatch(k0, s2.pos, 0.005);
            const ac = new AssertionCollector();
            ac.ok(dx > 0.2 && dx < 0.45, `三次 +X 微移累计 Δx=${dx.toFixed(3)}Å（约 0.3）`);
            ac.ok(s1.depth.undo === 1, `三次按键合并为一条历史（depth=${JSON.stringify(s1.depth)}）`);
            ac.ok(s2.n === 1 && r2.ok, `撤销微移位置还原（${JSON.stringify(r2)}）`);
            push('H6 键盘微移合并为一条 + 撤销还原', ac.failed === 0,
                JSON.stringify({ dx: +dx.toFixed(3), s1: s1.depth }) + ' | ' + ac.failures.join('；'));
        }

        // ---------- H7 生成（本地 SMILES 管线）：复合动作恰一条，撤销回空 / 恢复完整分子 ----------
        {
            await page.evaluate(() => window.__history.reset());
            await page.click('#btn-clear-molecule');
            await page.waitForTimeout(320);
            const cl = await readState();
            await page.evaluate(() => window.__history.reset());
            const gen = await page.evaluate(() => window.__generateFromSmiles('CC'));
            await page.waitForTimeout(350);
            const s1 = await readState();
            await clickUndo();
            const s2 = await readState();
            await clickRedo();
            const s3 = await readState();
            const r3 = posMatch(s1.pos, s3.pos, 0.005);
            const ac = new AssertionCollector();
            ac.ok(cl.n === 0 && /场景已清空/.test(cl.toast), `清空按钮（n=${cl.n}, toast="${cl.toast}"）`);
            ac.ok(!!gen && gen.ok !== false, `SMILES 生成成功（${JSON.stringify(gen && { ok: gen.ok, atomCount: gen.atomCount })}）`);
            ac.ok(s1.n === 8 && s1.nb === 7, `乙烷 8 原子 7 键（n=${s1.n}, nb=${s1.nb}）`);
            ac.ok(s1.depth.undo === 1 && s1.depth.redo === 0, `复合操作恰一条历史（depth=${JSON.stringify(s1.depth)}，清场+放置+补氢优化已合并）`);
            ac.ok(s2.n === 0 && s2.depth.undo === 0 && s2.depth.redo === 1, `撤销一次回到空场景（n=${s2.n}）`);
            ac.ok(s3.n === 8 && s3.nb === 7 && r3.ok, `恢复完整分子（n=${s3.n}, nb=${s3.nb}, ${JSON.stringify(r3)}）`);
            push('H7 生成复合动作恰一条 + 撤销回空 / 恢复完整分子', ac.failed === 0,
                JSON.stringify({ gen: gen && gen.atomCount, s1: s1.depth, n1: s1.n, nb1: s1.nb }) + ' | ' + ac.failures.join('；'));
        }

        // ---------- H8 新操作清空 redo ----------
        {
            await clickUndo();                       // n=8 → 0，redo 有 1
            const a = await readState();
            const redoBtnBefore = await page.evaluate(() => document.getElementById('btn-redo').classList.contains('hist-empty'));
            await dragNewCarbon(760, 430);           // 新动作
            const b = await readState();
            const redoBtnAfter = await page.evaluate(() => document.getElementById('btn-redo').classList.contains('hist-empty'));
            const ac = new AssertionCollector();
            ac.ok(a.n === 0 && a.depth.redo === 1 && !redoBtnBefore, `撤销后 redo 可用（depth=${JSON.stringify(a.depth)}）`);
            ac.ok(b.n === 1 && b.depth.undo === 1 && b.depth.redo === 0, `新拖拽清空 redo（depth=${JSON.stringify(b.depth)}）`);
            ac.ok(redoBtnAfter, '恢复按钮回到置灰态（hist-empty 恢复）');
            push('H8 新操作清空 redo（恢复按钮置灰）', ac.failed === 0,
                JSON.stringify({ a: a.depth, b: b.depth }) + ' | ' + ac.failures.join('；'));
        }

        // ---------- H9 键盘快捷键 Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y ----------
        {
            const p0 = (await readState()).pos;
            await page.keyboard.press('Control+z');
            await page.waitForTimeout(340);
            const s1 = await readState();
            await page.keyboard.press('Control+Shift+z');
            await page.waitForTimeout(340);
            const s2 = await readState();
            const back = posMatch(p0, s2.pos, 0.005);
            await page.keyboard.press('Control+z');
            await page.waitForTimeout(340);
            const s3 = await readState();
            await page.keyboard.press('Control+y');
            await page.waitForTimeout(340);
            const s4 = await readState();
            const back2 = posMatch(p0, s4.pos, 0.005);
            const ac = new AssertionCollector();
            ac.ok(s1.n === 0 && s1.depth.undo === 0 && s1.depth.redo === 1, `Ctrl+Z 撤销（n=${s1.n}, depth=${JSON.stringify(s1.depth)}）`);
            ac.ok(s2.n === 1 && s2.depth.undo === 1 && s2.depth.redo === 0 && back.ok, `Ctrl+Shift+Z 恢复（n=${s2.n}, ${JSON.stringify(back)}）`);
            ac.ok(s3.n === 0, `再 Ctrl+Z 撤销（n=${s3.n}）`);
            ac.ok(s4.n === 1 && back2.ok, `Ctrl+Y 恢复（n=${s4.n}, ${JSON.stringify(back2)}）`);
            push('H9 键盘快捷键 Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y', ac.failed === 0,
                JSON.stringify({ s1: s1.depth, s2: s2.depth, s4: s4.depth }) + ' | ' + ac.failures.join('；'));
        }

        // ---------- H10 预置示例生成（generateFromSpec 恰一条）+ 清空按钮撤销恢复苯环 ----------
        {
            await page.evaluate(() => window.__history.reset());
            await page.evaluate(() => window.__diag.generateSpec('benzene'));
            await page.waitForTimeout(300);
            const b1 = await readState();
            await page.click('#btn-clear-molecule');
            await page.waitForTimeout(320);
            const b2 = await readState();
            await clickUndo();
            const b3 = await readState();
            await clickRedo();
            const b4 = await readState();
            const rb3 = posMatch(b1.pos, b3.pos, 0.005);
            const ac = new AssertionCollector();
            ac.ok(b1.n === 12 && b1.nb === 12 && b1.depth.undo === 1, `苯环 12 原子 12 键、生成恰一条（n=${b1.n}, nb=${b1.nb}, depth=${JSON.stringify(b1.depth)}）`);
            ac.ok(b2.n === 0 && b2.depth.undo === 2 && /场景已清空/.test(b2.toast), `清空按钮提交（n=${b2.n}, toast="${b2.toast}"）`);
            ac.ok(b3.n === 12 && b3.nb === 12 && rb3.ok, `撤销清空完整恢复苯环（含 12 键，${JSON.stringify(rb3)}）`);
            ac.ok(b4.n === 0, `重做清空（n=${b4.n}）`);
            push('H10 示例生成恰一条 + 清空按钮撤销恢复完整分子', ac.failed === 0,
                JSON.stringify({ b1: { n: b1.n, nb: b1.nb, depth: b1.depth }, b2: b2.depth }) + ' | ' + ac.failures.join('；'));
        }

        // ---------- H11 全局优化提交：位置变化可撤销 ----------
        {
            await page.evaluate(() => { window.__diag.generateSpec('propane'); window.__history.reset(); });
            await page.waitForTimeout(250);
            const g0 = await readState();
            const ci = await page.evaluate(() => window.__dragMode.atoms().findIndex(a => a.t === 'C'));
            const sp = await atomScreen(ci);
            await page.mouse.move(sp.x, sp.y);
            await page.mouse.down();
            await page.mouse.move(sp.x + 90, sp.y + 50, { steps: 8 });
            await page.mouse.up();
            await page.waitForTimeout(450);
            const before = await readState();
            const pc = await page.evaluate(() => window.__dragMode.atoms().find(a => a.t === 'C').p);
            await page.click('#btn-optimize-all');
            await page.waitForTimeout(800);
            const after = await readState();
            const changed = !posMatch(before.pos, after.pos, 0.02).ok;
            await clickUndo();
            const undone = await readState();
            await clickRedo();
            const redone = await readState();
            const ru = posMatch(before.pos, undone.pos, 0.005);
            const rr = posMatch(after.pos, redone.pos, 0.005);
            const ac = new AssertionCollector();
            ac.ok(g0.n === 11 && g0.nb === 10, `丙烷 11 原子 10 键（n=${g0.n}, nb=${g0.nb}）`);
            ac.ok(before.n === 11 && before.depth.undo === 1, `拖碳后仍 11 原子、提交一条（depth=${JSON.stringify(before.depth)}）`);
            ac.ok(changed, `优化改变了几何（碳位置 ${JSON.stringify(pc)} 前后至少一处 >0.02Å）`);
            ac.ok(after.depth.undo === 2, `优化提交一条（depth=${JSON.stringify(after.depth)}）`);
            ac.ok(undone.depth.undo === 1 && undone.depth.redo === 1 && ru.ok, `撤销优化回到拖动后位置（${JSON.stringify(ru)}）`);
            ac.ok(rr.ok, `恢复回到优化后位置（${JSON.stringify(rr)}）`);
            push('H11 全局优化提交：几何变化可撤销/恢复', ac.failed === 0,
                JSON.stringify({ before: before.depth, after: after.depth, changed }) + ' | ' + ac.failures.join('；'));
        }

        // ---------- H12 全程零 console 错误 ----------
        {
            const ac = new AssertionCollector();
            ac.ok(report.consoleErrors.length === 0, `console 错误 ${report.consoleErrors.length} 条：${report.consoleErrors.slice(0, 3).join(' | ')}`);
            push('H12 零 console 错误', ac.failed === 0, JSON.stringify(report.consoleErrors.slice(0, 5)));
        }
    } catch (e) {
        report.failed = report.total = 1;
        report.results.push({ name: '页面加载/执行', pass: false, detail: 'FATAL: ' + String(e).slice(0, 400) });
    }

    report.elapsedMs = Date.now() - t0;
    await browser.close();
    if (serverProc) { try { serverProc.kill(); } catch (e) {} }

    console.log(JSON.stringify(report, null, 1));
    if (report.failed > 0) process.exitCode = 1;
})().catch(e => { console.error('FATAL', e); process.exit(1); });
