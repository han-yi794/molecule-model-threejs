// 真实鼠标验证：选中原子 → 右上角 ✕ 删除图标（CSS2DObject）→ 点击应删除该原子
// 背景：labelRenderer.domElement 是 pointer-events:none（CSS 继承），CSS2D 子元素若未显式
//       pointer-events:auto，真实鼠标点击会穿透到画布、div 的 click 永不触发
//       （JS 合成 element.click() 不走命中测试，测不出这个问题）
// 运行：cmd /c "node verify_delete_icon.js > verify_delete_icon.json 2>&1"
const { chromium } = require('playwright-core');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 8000;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=delicon`;

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

// 贪心匹配：before 比 after 恰好多 1 个位置（被删原子），其余一一对上（容差 tol）
function matchRemoval(before, after, tol) {
    const used = new Array(after.length).fill(false);
    let removed = -1;
    for (let i = 0; i < before.length; i++) {
        let hit = -1;
        for (let j = 0; j < after.length; j++) {
            if (used[j]) continue;
            const d = Math.abs(before[i][0] - after[j][0]) + Math.abs(before[i][1] - after[j][1]) + Math.abs(before[i][2] - after[j][2]);
            if (d < tol) { hit = j; break; }
        }
        if (hit >= 0) used[hit] = true;
        else if (removed === -1) removed = i;
        else return { ok: false, reason: '多于一个原子未匹配 i=' + i };
    }
    return { ok: removed >= 0, removedIndex: removed };
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

    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(
            () => !!(window.__diag && window.__dragMode && window.__createHeavyAtom),
            null, { timeout: 30000 });

        await page.evaluate(() => {
            try { window.__setInputPanelOpen && window.__setInputPanelOpen(false); } catch (e) {}
            window.__diag.generate('methane');
        });
        await page.waitForTimeout(400);

        // ---------- 真实鼠标点击原子中心 → 选中（选 H，端点原子，删它只断 1 根键） ----------
        const info = await page.evaluate(() => {
            const atoms = window.__dragMode.atoms();
            const a0 = atoms.find(a => a.t === 'H') || atoms[0];
            const sp = window.__dragMode.project(a0.p[0], a0.p[1], a0.p[2]);
            const el = document.elementFromPoint(sp.x, sp.y);
            return { n: atoms.length, a0t: a0.t, posBefore: atoms.map(a => a.p), sp, hitTag: el ? el.tagName : null };
        });
        await page.mouse.click(info.sp.x, info.sp.y);
        await page.waitForTimeout(700);

        // ---------- 场景 1：点选后图标出现（且点击点无 UI 遮挡） ----------
        {
            const p1 = await page.evaluate(() => ({
                icon: !!document.querySelector('[title="删除选中原子"]'),
                atoms: window.__dragMode.atoms().length,
            }));
            const ac = new AssertionCollector();
            ac.ok(info.hitTag === 'CANVAS', `原子点击点命中画布（实际 ${info.hitTag}，验证无遮挡）`);
            ac.ok(p1.icon, '点选原子后 ✕ 图标出现');
            push('1 点选原子后 ✕ 图标出现', ac.failed === 0,
                `hit=${info.hitTag} icon=${p1.icon} atoms=${p1.atoms} 点选=${info.a0t} | ${ac.failures.join('；')}`);
        }

        // ---------- 场景 2：图标真实可命中（回归核心：pointer-events + 命中测试） ----------
        let iconGeom = null;
        {
            const p2 = await page.evaluate(() => {
                const el = document.querySelector('[title="删除选中原子"]');
                if (!el) return { found: false };
                const vis = el.firstElementChild || el;
                const r = el.getBoundingClientRect();
                const vr = vis.getBoundingClientRect();
                const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                const cs = getComputedStyle(el);
                const top = document.elementFromPoint(cx, cy);
                return {
                    found: true, cx, cy, w: +r.width.toFixed(1), h: +r.height.toFixed(1),
                    pointerEvents: cs.pointerEvents,
                    topIsIcon: top === el || (!!el.contains && el.contains(top)),
                    topTag: top ? top.tagName : null,
                    visW: +vr.width.toFixed(1),
                    bg: getComputedStyle(vis).backgroundColor,
                };
            });
            iconGeom = p2;
            const ac = new AssertionCollector();
            ac.ok(p2.found, '图标存在');
            ac.ok(p2.pointerEvents === 'auto', `图标 pointer-events=auto（实际 ${p2.pointerEvents}，none 会被鼠标穿透）`);
            ac.ok(p2.topIsIcon, `图标中心命中测试应返回图标本身（实际 ${p2.topTag}）`);
            push('2 图标真实可命中(pointer-events/命中测试)', ac.failed === 0,
                `rect=${p2.w}x${p2.h}@${p2.cx && p2.cx.toFixed(0)},${p2.cy && p2.cy.toFixed(0)} pe=${p2.pointerEvents} top=${p2.topTag} | ${ac.failures.join('；')}`);
        }

        // ---------- 场景 3：真实悬停放大+变亮 + 不漂移（图标中心点悬停后仍命中图标） ----------
        {
            await page.mouse.move(iconGeom.cx, iconGeom.cy);
            // 悬停动画 = mouseenter 设 transform + CSS 过渡 0.12s：输入事件可能被主线程延迟，
            // 固定 300ms 等待在负载高时会测到过渡中间值（曾测到 visW=21.7 < 阈值 22）。
            // 改为轮询等待缩放到位（解析 matrix 的 scale ≥ 1.17）后再测量。
            try {
                await page.waitForFunction(() => {
                    const el = document.querySelector('[title="删除选中原子"]');
                    const inner = el && el.firstElementChild;
                    if (!inner) return false;
                    const m = getComputedStyle(inner).transform.match(/matrix\(([-\d.]+)/);
                    return !!m && parseFloat(m[1]) >= 1.17;
                }, null, { timeout: 3000 });
            } catch (e) {}
            await page.waitForTimeout(100);
            const p3 = await page.evaluate(({ cx, cy }) => {
                const el = document.querySelector('[title="删除选中原子"]');
                if (!el) return { found: false };
                const vis = el.firstElementChild || el;
                const vr = vis.getBoundingClientRect();
                const cs = getComputedStyle(vis);
                const top = document.elementFromPoint(cx, cy);
                return {
                    found: true, visW: +vr.width.toFixed(1), bg: cs.backgroundColor, transform: cs.transform,
                    topStillIcon: top === el || (!!el.contains && el.contains(top)),
                    topTag: top ? top.tagName : null,
                };
            }, { cx: iconGeom.cx, cy: iconGeom.cy });
            const ac = new AssertionCollector();
            ac.ok(p3.found, '悬停后图标仍在');
            ac.ok(p3.visW > iconGeom.visW * 1.1, `悬停放大（视觉宽 ${iconGeom.visW} → ${p3.visW}，放大后 ${p3.transform}）`);
            ac.ok(p3.bg !== iconGeom.bg, `悬停背景变亮（${iconGeom.bg} → ${p3.bg}）`);
            ac.ok(p3.topStillIcon, `悬停放大后不漂移——原中心点仍命中图标（实际 ${p3.topTag}）`);
            push('3 悬停放大+变亮+不漂移', ac.failed === 0,
                JSON.stringify({ pre: { w: iconGeom.visW, bg: iconGeom.bg }, post: p3 }) + ' | ' + ac.failures.join('；'));
        }

        // ---------- 场景 4：真实鼠标点击 ✕ → 原子删除 ----------
        {
            const b4 = await page.evaluate(() => ({
                n: window.__dragMode.atoms().length,
                bonds: window.__diag.bonds().length,
                pos: window.__dragMode.atoms().map(a => a.p),
            }));
            await page.mouse.click(iconGeom.cx, iconGeom.cy);
            await page.waitForTimeout(500);
            const a4 = await page.evaluate(() => ({
                n: window.__dragMode.atoms().length,
                bonds: window.__diag.bonds().length,
                icon: !!document.querySelector('[title="删除选中原子"]'),
                toast: (document.getElementById('toast-message') || {}).textContent || '',
                pos: window.__dragMode.atoms().map(a => a.p),
            }));
            const match = matchRemoval(b4.pos, a4.pos, 0.01);
            const ac = new AssertionCollector();
            ac.ok(a4.n === b4.n - 1, `原子数 ${b4.n}→${a4.n}（期望减 1）`);
            ac.ok(a4.bonds === b4.bonds - 1, `键数 ${b4.bonds}→${a4.bonds}（期望减 1）`);
            ac.ok(!a4.icon, '删除后图标消失');
            ac.ok(/已删除/.test(a4.toast), `toast 提示（实际 "${a4.toast}"）`);
            ac.ok(match.ok, `其余原子位置不变（恰删 1 个，${JSON.stringify(match)}）`);
            push('4 真实点击 ✕ 删除原子', ac.failed === 0,
                `atoms ${b4.n}→${a4.n} bonds ${b4.bonds}→${a4.bonds} icon=${a4.icon} toast="${a4.toast}" | ${ac.failures.join('；')}`);
        }

        // ---------- 场景 5：删除后再点选另一原子 → 图标重现 ----------
        {
            const sp5 = await page.evaluate(() => {
                const atoms = window.__dragMode.atoms();
                const a0 = atoms[0];
                return window.__dragMode.project(a0.p[0], a0.p[1], a0.p[2]);
            });
            await page.mouse.click(sp5.x, sp5.y);
            await page.waitForTimeout(700);
            const p5 = await page.evaluate(() => ({ icon: !!document.querySelector('[title="删除选中原子"]') }));
            push('5 删除后再选原子图标重现', p5.icon, JSON.stringify(p5));
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
