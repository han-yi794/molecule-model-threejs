// verify_keypad_ui.js — 原子库清理 + 分子式小键盘布局/移动端防溢出验证（球棍模型4.html）
// 背景（2026-10-17）：
//   ① 原子库（#sidebar）除原子卡片外的按钮/下拉全部移除（显示离域π键、π自测、示例下拉、生成、
//      删除选中、自动测试全部）——π 高亮开关在检查器「视图」段，删除原子用原子上的垃圾桶图标/Delete 键。
//   ② 分子式小键盘布局优化（元素/数字分区 + .fkp-key 统一样式）并防止手机端超出屏幕
//      （宽度 min(300px,100vw-16px) + 定位夹取视口 + 放不下翻到上方 + max-height 限高 + resize 重定位）。
// 断言：
//   K1 键盘结构：19 元素 + 10 下标数字 = 29 键（分区容器存在）
//   K2 键点击追加到分子式框（C+₂ → "C₂"）且焦点保持在输入框
//   K3 桌面：键盘位于输入框正下方且完全在视口内
//   K4 Escape 关闭 / 点输入框重开 / ✕ 关闭
//   K5 手机 375×667：键盘完全在屏内、宽度受限、键位触摸高度 ≥32、点键仍可输入
//   K6 极矮 375×300（横屏场景）：max-height 生效、整体仍在屏内
//   K7 视口缩放（1440×900→800×360）后自动重定位、仍在屏内
//   K8 收起输入面板时键盘同步收起
//   K9 拖动标题栏移动键盘（真实鼠标）：拖动中保持展开、位移生效、焦点保持、按键仍可用、
//      重新弹出保持位置、resetPosition 回锚定；关闭按钮不是拖动把手
//   K10 手机触摸拖动（CDP touch 事件）：触摸可移动、不超出屏幕
//   S1 原子库只剩原子卡片（8 张）+ 提示文字，按钮/下拉（含拖动方式）数量 0
//   S2 已移除元素不存在；#btn-toggle-pi 全文档唯一且在检查器「视图」段
//   S3 检查器 π 开关仍可切换；原子生成/自测入口无回归（__diag.generate + window.runAllExamplesAndTests）
//   S5 拖动方式仍可切换（右下角徽章点击循环 + Tab 快捷键）
//   S4 控制台零错误
// 运行：cmd /c "node verify_keypad_ui.js > verify_keypad_ui.json 2>&1"
const { chromium } = require('playwright-core');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 8000;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=keypad`;

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

(async () => {
    const t0 = Date.now();
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const report = { passed: 0, failed: 0, total: 0, results: [], consoleErrors: [], elapsedMs: 0 };

    const push = (name, pass, detail) => {
        report.total++; pass ? report.passed++ : report.failed++;
        report.results.push({ name, pass, detail });
    };

    const newPage = async (vw, vh) => {
        const p = await browser.newPage({ viewport: { width: vw, height: vh } });
        p.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
        p.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
        await p.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await p.waitForFunction(
            () => !!(window.__diag && window.__showFormulaKeypad && window.__dragMode && document.getElementById('formula-input')),
            null, { timeout: 30000 });
        await p.waitForTimeout(250);
        return p;
    };

    try {
        const page = await newPage(1440, 900);
        await page.evaluate(() => window.__setInputPanelOpen(true));
        await page.fill('#formula-input', '');
        await page.click('#formula-input');
        await page.waitForTimeout(150);

        // ---------- K1 键盘结构 ----------
        {
            const r = await page.evaluate(() => {
                const kp = document.getElementById('formula-keypad');
                const els = [...document.querySelectorAll('#formula-keypad-els .fkp-key')].map(k => k.textContent);
                const nums = [...document.querySelectorAll('#formula-keypad-nums .fkp-key')].map(k => k.textContent);
                const sect = [...document.querySelectorAll('#formula-keypad .fkp-sect')].map(s => s.textContent);
                return { els, nums, sect, display: getComputedStyle(kp).display };
            });
            const ac = new AssertionCollector();
            ac.ok(r.display !== 'none', `键盘可见（display=${r.display}）`);
            ac.ok(r.els.length === 19, `元素键 19 个（实际 ${r.els.length}）`);
            ac.ok(r.els.join(',') === 'C,H,N,O,S,P,F,Cl,Br,I,Na,K,Ca,Mg,Fe,Cu,Zn,B,Si', `元素顺序正确（${r.els.join(',')}）`);
            ac.ok(r.nums.length === 10, `数字键 10 个（实际 ${r.nums.length}）`);
            ac.ok(r.nums.join('') === '₀₁₂₃₄₅₆₇₈₉', `数字为 Unicode 下标（实际 ${r.nums.join('')}）`);
            ac.ok(r.sect.length === 2, `分区标签 2 个（实际 ${r.sect.length}）`);
            push('K1 键盘结构 19 元素 + 10 下标数字', ac.failed === 0,
                `els=${r.els.length} nums=${r.nums.length} sect="${r.sect.join('/')}" | ${ac.failures.join('；')}`);
        }

        // ---------- K2 键点击追加 + 焦点保持 ----------
        {
            await page.click('#formula-keypad-els .fkp-key >> nth=0');   // C
            await page.click('#formula-keypad-nums .fkp-key >> nth=2');  // ₂
            const r = await page.evaluate(() => ({
                v: document.getElementById('formula-input').value,
                focused: document.activeElement && document.activeElement.id
            }));
            const ac = new AssertionCollector();
            ac.ok(r.v === 'C₂', `输入值 C₂（实际 "${r.v}"）`);
            ac.ok(r.focused === 'formula-input', `焦点仍在输入框（实际 ${r.focused}）`);
            push('K2 键点击追加 + 焦点保持', ac.failed === 0, `value="${r.v}" focus=${r.focused} | ${ac.failures.join('；')}`);
        }

        // ---------- K3 桌面定位（输入框下方 + 视口内） ----------
        {
            const r = await page.evaluate(() => {
                const kp = document.getElementById('formula-keypad').getBoundingClientRect();
                const inp = document.getElementById('formula-input').getBoundingClientRect();
                return { t: kp.top, l: kp.left, rt: kp.right, b: kp.bottom,
                         itb: inp.bottom, vw: window.innerWidth, vh: window.innerHeight };
            });
            const ac = new AssertionCollector();
            ac.ok(r.t >= r.itb - 1, `位于输入框下方（kp.top=${Math.round(r.t)} ≥ input.bottom=${Math.round(r.itb)}）`);
            ac.ok(r.l >= 0 && r.t >= 0 && r.rt <= r.vw + 0.5 && r.b <= r.vh + 0.5,
                `完全在视口内（l=${Math.round(r.l)} r=${Math.round(r.rt)}/${r.vw} b=${Math.round(r.b)}/${r.vh}）`);
            push('K3 桌面定位与视口内', ac.failed === 0, `top=${Math.round(r.t)} bottom=${Math.round(r.b)} | ${ac.failures.join('；')}`);
        }

        // ---------- K4 Escape / 重开 / ✕ ----------
        {
            await page.keyboard.press('Escape');
            const hidden = await page.evaluate(() => document.getElementById('formula-keypad').style.display === 'none');
            await page.click('#formula-input');
            const shown = await page.evaluate(() => document.getElementById('formula-keypad').style.display !== 'none');
            await page.click('#formula-keypad-close');
            const closed = await page.evaluate(() => document.getElementById('formula-keypad').style.display === 'none');
            const ac = new AssertionCollector();
            ac.ok(hidden, 'Escape 关闭');
            ac.ok(shown, '点输入框重新弹出');
            ac.ok(closed, '✕ 关闭');
            push('K4 Escape/重开/✕ 关闭', ac.failed === 0, `hidden=${hidden} shown=${shown} closed=${closed} | ${ac.failures.join('；')}`);
        }

        // ---------- K7 视口缩放后自动重定位 ----------
        {
            await page.click('#formula-input');   // 重新打开键盘
            await page.setViewportSize({ width: 800, height: 360 });
            await page.waitForTimeout(400);       // 等 resize 监听重定位
            const r = await page.evaluate(() => {
                const kp = document.getElementById('formula-keypad').getBoundingClientRect();
                return { t: kp.top, l: kp.left, rt: kp.right, b: kp.bottom, h: kp.height,
                         vw: window.innerWidth, vh: window.innerHeight,
                         display: document.getElementById('formula-keypad').style.display };
            });
            const ac = new AssertionCollector();
            ac.ok(r.display !== 'none', `缩放后仍可见（display=${r.display}）`);
            ac.ok(r.l >= 0 && r.t >= 0 && r.rt <= r.vw + 0.5 && r.b <= r.vh + 0.5,
                `缩放后仍在视口内（t=${Math.round(r.t)} b=${Math.round(r.b)}/${r.vh}）`);
            push('K7 视口缩放后自动重定位', ac.failed === 0, `top=${Math.round(r.t)} bottom=${Math.round(r.b)}/${r.vh} | ${ac.failures.join('；')}`);
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.waitForTimeout(300);
        }

        // ---------- K8 收起输入面板同步收起键盘 ----------
        {
            await page.click('#formula-input');   // 确保打开
            const before = await page.evaluate(() => document.getElementById('formula-keypad').style.display !== 'none');
            await page.evaluate(() => window.__setInputPanelOpen(false));
            const after = await page.evaluate(() => document.getElementById('formula-keypad').style.display === 'none');
            await page.evaluate(() => window.__setInputPanelOpen(true));
            const ac = new AssertionCollector();
            ac.ok(before, `收起前键盘打开（${before}）`);
            ac.ok(after, `收起输入面板后键盘同步隐藏（${after}）`);
            push('K8 收起输入面板同步收起键盘', ac.failed === 0, `before=${before} after=${after} | ${ac.failures.join('；')}`);
        }

        // ---------- K9 拖动标题栏移动键盘（2026-10-30） ----------
        {
            await page.waitForTimeout(250);
            await page.evaluate(() => window.__formulaKeypad.resetPosition());
            await page.fill('#formula-input', '');
            await page.click('#formula-input');
            await page.waitForTimeout(200);
            const before = await page.evaluate(() => {
                const kp = document.getElementById('formula-keypad');
                const r = kp.getBoundingClientRect();
                return { left: r.left, top: r.top, display: kp.style.display };
            });
            const head = await page.locator('#formula-keypad .fkp-head').boundingBox();
            const dx = 60, dy = 90;
            const sx = head.x + head.width / 2 - 20, sy = head.y + head.height / 2;
            await page.mouse.move(sx, sy);
            await page.mouse.down();
            await page.mouse.move(sx + dx, sy + dy, { steps: 6 });
            const midDisplay = await page.evaluate(() => document.getElementById('formula-keypad').style.display);
            await page.mouse.up();
            await page.waitForTimeout(120);
            const after = await page.evaluate(() => {
                const kp = document.getElementById('formula-keypad');
                const r = kp.getBoundingClientRect();
                return { left: r.left, top: r.top, display: kp.style.display,
                         moved: window.__formulaKeypad.isMoved(),
                         dragging: kp.querySelector('.fkp-head').classList.contains('dragging'),
                         active: document.activeElement && document.activeElement.id,
                         cursor: getComputedStyle(kp.querySelector('.fkp-head')).cursor };
            });
            await page.click('#formula-keypad-els .fkp-key >> nth=0');   // C
            const val = await page.inputValue('#formula-input');
            // 关闭按钮不是拖动把手：按住拖它键盘不移动
            const closeBox = await page.locator('#formula-keypad-close').boundingBox();
            await page.mouse.move(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
            await page.mouse.down();
            await page.mouse.move(closeBox.x + 50, closeBox.y + 40, { steps: 4 });
            await page.mouse.up();
            await page.waitForTimeout(100);
            const afterCloseDrag = await page.evaluate(() => {
                const kp = document.getElementById('formula-keypad');
                const r = kp.getBoundingClientRect();
                return { left: r.left, top: r.top, display: kp.style.display };
            });
            await page.click('#formula-keypad-close');
            await page.click('#formula-input');
            await page.waitForTimeout(150);
            const reopen = await page.evaluate(() => {
                const r = document.getElementById('formula-keypad').getBoundingClientRect();
                return { left: r.left, top: r.top };
            });
            await page.evaluate(() => window.__formulaKeypad.resetPosition());
            const reset = await page.evaluate(() => {
                const kp = document.getElementById('formula-keypad').getBoundingClientRect();
                const inp = document.getElementById('formula-input').getBoundingClientRect();
                return { top: kp.top, left: kp.left, inputBottom: inp.bottom, moved: window.__formulaKeypad.isMoved() };
            });
            const ac = new AssertionCollector();
            ac.ok(midDisplay === 'block', `拖动中保持展开（display=${midDisplay}）`);
            ac.ok(Math.abs(after.left - (before.left + dx)) < 2 && Math.abs(after.top - (before.top + dy)) < 2,
                `拖动位移 +${dx}/+${dy}（${Math.round(before.left)},${Math.round(before.top)} → ${Math.round(after.left)},${Math.round(after.top)}）`);
            ac.ok(after.moved && !after.dragging, `isMoved=${after.moved}，dragging 类已清除=${!after.dragging}`);
            ac.ok(after.active === 'formula-input', `拖动后输入框仍聚焦（${after.active}）`);
            ac.ok(after.cursor === 'grab', `标题栏 cursor=grab（${after.cursor}）`);
            ac.ok(val === 'C', `拖动后点键仍输入（"${val}"）`);
            ac.ok(afterCloseDrag.display === 'block'
                && Math.abs(afterCloseDrag.left - after.left) < 1 && Math.abs(afterCloseDrag.top - after.top) < 1,
                `按住关闭按钮拖动不移动键盘（${Math.round(afterCloseDrag.left)},${Math.round(afterCloseDrag.top)}）`);
            ac.ok(Math.abs(reopen.left - after.left) < 2 && Math.abs(reopen.top - after.top) < 2,
                `重新弹出保持拖动位置（${Math.round(reopen.left)},${Math.round(reopen.top)}）`);
            ac.ok(reset.moved === false && reset.top >= reset.inputBottom - 1 && reset.top - reset.inputBottom < 10
                && Math.abs(reset.left - before.left) < 2,
                `resetPosition 回输入框锚定（top=${Math.round(reset.top)} inputBottom=${Math.round(reset.inputBottom)}）`);
            push('K9 拖动标题栏移动键盘（位置保持/复位/按键无回归）', ac.failed === 0,
                `before=(${Math.round(before.left)},${Math.round(before.top)}) after=(${Math.round(after.left)},${Math.round(after.top)}) | ${ac.failures.join('；')}`);
        }

        // ---------- S1/S2 原子库清理 ----------
        {
            const r = await page.evaluate(() => ({
                atoms: document.querySelectorAll('#sidebar .atom-card').length,
                actionBtns: document.querySelectorAll('#sidebar .action-btn').length,
                selects: document.querySelectorAll('#sidebar select').length,
                hint: !!document.querySelector('#sidebar .hint'),
                removed: ['molecule-select', 'btn-generate-molecule', 'btn-run-all-tests', 'btn-pi-test', 'drag-mode-select'].filter(id => document.getElementById(id)),
                piCount: document.querySelectorAll('#btn-toggle-pi').length,
                piInInspector: !!document.querySelector('#inspect-panel #btn-toggle-pi')
            }));
            const ac = new AssertionCollector();
            ac.ok(r.atoms === 8, `8 张原子卡片（实际 ${r.atoms}）`);
            ac.ok(r.actionBtns === 0, `原子库内无 .action-btn（实际 ${r.actionBtns}）`);
            ac.ok(r.selects === 0, `原子库内无下拉（实际 ${r.selects}）`);
            ac.ok(r.hint, '提示文字保留');
            ac.ok(r.removed.length === 0, `已移除元素确认不存在（残留 ${r.removed.join(',') || '无'}）`);
            ac.ok(r.piCount === 1 && r.piInInspector, `#btn-toggle-pi 全文档唯一且在检查器视图段（count=${r.piCount}）`);
            push('S1/S2 原子库只剩原子+提示，按钮/下拉全部消失', ac.failed === 0,
                `atoms=${r.atoms} actionBtn=${r.actionBtns} select=${r.selects} pi=${r.piCount} | ${ac.failures.join('；')}`);
        }

        // ---------- S3 功能无回归 ----------
        {
            // 抽屉是覆盖式浮层，会盖住右侧检查器；先收起再点视图段开关
            await page.evaluate(() => window.__setInputPanelOpen(false));
            await page.waitForFunction(() => {
                const el = document.getElementById('input-panel');
                return el && !el.classList.contains('open') && getComputedStyle(el).visibility === 'hidden';
            }, null, { timeout: 5000 });
            await page.evaluate(() => { if (!window.__delocPiMode()) window.__setDelocPiMode(true); });
            const before = await page.evaluate(() => document.getElementById('chk-pi').checked);
            await page.click('#inspect-panel #btn-toggle-pi');
            const after = await page.evaluate(() => document.getElementById('chk-pi').checked);
            const gen = await page.evaluate(() => { try { window.__diag.generate('butane'); return window.__dragMode.atoms().length; } catch (e) { return 'ERR ' + e; } });
            const hasRun = await page.evaluate(() => typeof window.runAllExamplesAndTests === 'function');
            const ac = new AssertionCollector();
            ac.ok(before === false, `π 高亮初始关闭（chk-pi=${before}）`);
            ac.ok(after === true, `点击检查器视图段 π 开关后 chk-pi=true（实际 ${after}）`);
            ac.ok(gen === 14, `__diag 生成丁烷 14 原子（实际 ${gen}）`);
            ac.ok(hasRun, 'window.runAllExamplesAndTests 可调用');
            push('S3 检查器视图段 π 开关 / 生成入口无回归', ac.failed === 0,
                `chk ${before}→${after} atoms=${gen} runAll=${hasRun} | ${ac.failures.join('；')}`);
        }

        // ---------- S5 拖动方式仍可切换（徽章点击循环 + Tab 快捷键） ----------
        {
            const m0 = await page.evaluate(() => window.__dragMode.get());
            await page.click('#mode-badge');
            await page.waitForTimeout(120);
            const m1 = await page.evaluate(() => window.__dragMode.get());
            await page.keyboard.press('Tab');
            await page.waitForTimeout(120);
            const m2 = await page.evaluate(() => window.__dragMode.get());
            await page.evaluate((m) => window.__dragMode.set(m), m0);   // 恢复原模式
            const ac = new AssertionCollector();
            ac.ok(!!m1 && m1 !== m0, `徽章点击切换（${m0} → ${m1}）`);
            ac.ok(!!m2 && m2 !== m1, `Tab 键继续循环（${m1} → ${m2}）`);
            push('S5 徽章/Tab 切换拖动方式（替代已删下拉）', ac.failed === 0,
                `m0=${m0} badge=${m1} tab=${m2} | ${ac.failures.join('；')}`);
        }

        await page.screenshot({ path: '_kp_desktop.png' });
        await page.close();

        // ---------- K5 手机 375×667 ----------
        {
            const m = await newPage(375, 667);
            await m.evaluate(() => window.__setInputPanelOpen(true));
            await m.evaluate(() => window.__showFormulaKeypad());
            await m.waitForTimeout(250);
            const r = await m.evaluate(() => {
                const kp = document.getElementById('formula-keypad').getBoundingClientRect();
                const key = document.querySelector('#formula-keypad-els .fkp-key').getBoundingClientRect();
                return { t: kp.top, l: kp.left, rt: kp.right, b: kp.bottom, w: kp.width,
                         keyH: key.height, vw: window.innerWidth, vh: window.innerHeight };
            });
            await m.click('#formula-keypad-els .fkp-key >> nth=1');   // H
            const v = await m.evaluate(() => document.getElementById('formula-input').value);
            const ac = new AssertionCollector();
            ac.ok(r.l >= 0 && r.t >= 0 && r.rt <= r.vw + 0.5 && r.b <= r.vh + 0.5,
                `完全在屏内（t=${Math.round(r.t)} b=${Math.round(r.b)}/${r.vh} l=${Math.round(r.l)} r=${Math.round(r.rt)}/${r.vw}）`);
            ac.ok(r.w <= r.vw - 8, `宽度受限（${Math.round(r.w)} ≤ ${r.vw - 8}）`);
            ac.ok(r.keyH >= 32, `键位触摸高度 ≥32（实际 ${Math.round(r.keyH)}）`);
            ac.ok(v === 'H', `手机点键仍可输入（"${v}"）`);
            push('K5 手机 375×667 不超出屏幕', ac.failed === 0,
                `rect l=${Math.round(r.l)} t=${Math.round(r.t)} w=${Math.round(r.w)} h=${Math.round(r.b - r.t)} keyH=${Math.round(r.keyH)} | ${ac.failures.join('；')}`);
            await m.screenshot({ path: '_kp_mobile.png' });
            await m.close();
        }

        // ---------- K6 极矮 375×300 ----------
        {
            const s = await newPage(375, 300);
            await s.evaluate(() => window.__setInputPanelOpen(true));
            await s.evaluate(() => window.__showFormulaKeypad());
            await s.waitForTimeout(250);
            const r = await s.evaluate(() => {
                const el = document.getElementById('formula-keypad');
                const kp = el.getBoundingClientRect();
                return { t: kp.top, l: kp.left, rt: kp.right, b: kp.bottom, h: kp.height,
                         overflowY: getComputedStyle(el).overflowY,
                         vw: window.innerWidth, vh: window.innerHeight };
            });
            const ac = new AssertionCollector();
            ac.ok(r.l >= 0 && r.t >= 0 && r.rt <= r.vw + 0.5 && r.b <= r.vh + 0.5,
                `极矮视口仍在屏内（t=${Math.round(r.t)} b=${Math.round(r.b)}/${r.vh}）`);
            ac.ok(r.h <= r.vh - 16 + 1, `高度受 max-height 限制（${Math.round(r.h)} ≤ ${r.vh - 16}）`);
            ac.ok(r.overflowY === 'auto', `内容超高时可内部滚动（overflow-y=${r.overflowY}）`);
            push('K6 极矮视口（375×300）防溢出', ac.failed === 0,
                `rect t=${Math.round(r.t)} b=${Math.round(r.b)} h=${Math.round(r.h)} | ${ac.failures.join('；')}`);
            await s.close();
        }

        // ---------- K10 手机触摸拖动（CDP touch 事件） ----------
        {
            const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
            const tp = await ctx.newPage();
            tp.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
            tp.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
            await tp.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
            await tp.waitForFunction(() => !!(window.__formulaKeypad && window.__diag), null, { timeout: 30000 });
            await tp.evaluate(() => window.__setInputPanelOpen(true));
            await tp.evaluate(() => window.__showFormulaKeypad());
            await tp.waitForTimeout(300);
            const before = await tp.evaluate(() => {
                const kp = document.getElementById('formula-keypad');
                const r = kp.getBoundingClientRect();
                return { left: r.left, top: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
            });
            const head = await tp.locator('#formula-keypad .fkp-head').boundingBox();
            const dx = 30, dy = 40;
            const sx = head.x + head.width / 2 - 10, sy = head.y + head.height / 2;
            const client = await ctx.newCDPSession(tp);
            const point = (x, y) => [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 }];
            await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(sx, sy) });
            await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(sx + dx / 2, sy + dy / 2) });
            await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(sx + dx, sy + dy) });
            await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await tp.waitForTimeout(200);
            const after = await tp.evaluate(() => {
                const kp = document.getElementById('formula-keypad');
                const r = kp.getBoundingClientRect();
                return { left: r.left, top: r.top, right: r.right, bottom: r.bottom,
                         moved: window.__formulaKeypad.isMoved(),
                         dragging: kp.querySelector('.fkp-head').classList.contains('dragging'),
                         vw: innerWidth, vh: innerHeight, display: kp.style.display };
            });
            const expLeft = Math.max(8, Math.min(before.left + dx, after.vw - before.w - 8));
            const expTop = Math.max(8, Math.min(before.top + dy, after.vh - before.h - 8));
            const ac = new AssertionCollector();
            ac.ok(after.display === 'block', `触摸拖动后仍展开（display=${after.display}）`);
            ac.ok(Math.abs(after.left - expLeft) < 2 && Math.abs(after.top - expTop) < 2,
                `触摸位移生效（${Math.round(before.left)},${Math.round(before.top)} → ${Math.round(after.left)},${Math.round(after.top)}，期望 ${Math.round(expLeft)},${Math.round(expTop)}）`);
            ac.ok(after.moved === true && after.dragging === false, `isMoved=${after.moved}，dragging 已清除=${!after.dragging}`);
            ac.ok(after.left >= 7 && after.top >= 7 && after.right <= after.vw - 7 && after.bottom <= after.vh - 7,
                `仍在屏内（${Math.round(after.left)},${Math.round(after.top)} - ${Math.round(after.right)},${Math.round(after.bottom)} / ${after.vw}×${after.vh}）`);
            push('K10 手机触摸拖动键盘', ac.failed === 0,
                `before=(${Math.round(before.left)},${Math.round(before.top)}) after=(${Math.round(after.left)},${Math.round(after.top)}) | ${ac.failures.join('；')}`);
            await tp.close();
            await ctx.close();
        }

        // ---------- S4 控制台零错误 ----------
        push('S4 控制台零错误', report.consoleErrors.length === 0,
            report.consoleErrors.length ? report.consoleErrors.slice(0, 3).join(' | ') : '0 条');
    } catch (e) {
        push('FATAL', false, String((e && e.stack) || e).slice(0, 400));
    } finally {
        await browser.close();
        if (serverProc) serverProc.kill();
    }

    report.elapsedMs = Date.now() - t0;
    console.log(JSON.stringify(report, null, 2));
    console.log(`\n== verify_keypad_ui: ${report.passed}/${report.total} passed, ${report.failed} failed (${report.elapsedMs}ms) ==`);
    process.exit(report.failed === 0 ? 0 : 1);
})();
