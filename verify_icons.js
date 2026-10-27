// verify_icons.js — Lucide 内联图标系统验证（球棍模型4.html）
// 背景：界面 emoji/符号图标统一替换为 Lucide（lucide-static v1.58.0，ISC）内联 SVG。
//   静态 HTML 用 <span class="ui-ic" data-icon="名字" data-size="N"></span> 占位，
//   模块启动时 hydrateIcons() 填充；动态文案用 iconSvg(name, size) 拼 innerHTML。
// 断言：
//   I1 全部占位水合（[data-icon]:not(svg) 均有 svg.ui-icon 子节点，数量 ≥ 30）
//   I2 关键元素图标齐全（各区域选择器逐一命中）
//   I3 可见 UI 文本无残留 emoji/符号（📖⚙🧪✨🗑⌨⌫⇄🖱✋💡❔✕◐⚛ ▾▴ ✓ ×；btn-help 文本为空）
//   I4 勾选框选中态为 SVG 对勾（::after background-image = data:image/svg+xml）
//   I5 折叠交互：使用说明/设置/输入面板 点击后 chevron 方向翻转
//   I6 帮助面板：btn-help（circle-help）点击开、help-close（x）点击关
//   I7 选中原子删除图标内层含 Lucide trash-2（删除语义）
//   I8 控制台零错误
// 运行：cmd /c "node verify_icons.js > verify_icons.json 2>&1"
const { chromium } = require('playwright-core');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 8000;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=icons`;

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
            () => !!(window.__diag && window.__iconSvg && document.getElementById('btn-help')),
            null, { timeout: 30000 });
        await page.waitForTimeout(300);

        // ---------- I1 占位全部水合 ----------
        {
            const r1 = await page.evaluate(() => {
                const all = [...document.querySelectorAll('[data-icon]:not(svg)')];
                const empty = all.filter(el => !el.querySelector('svg.ui-icon'));
                const sizes = all.map(el => el.dataset.size || '(默认)');
                return { total: all.length, empty: empty.slice(0, 5).map(e => e.outerHTML.slice(0, 90)), sizes };
            });
            const ac = new AssertionCollector();
            ac.ok(r1.total >= 30, `占位数量 ${r1.total} ≥ 30`);
            ac.ok(r1.empty.length === 0, `无空壳占位（空 ${r1.empty.length}：${r1.empty.join(' | ')}）`);
            push('I1 全部占位水合', ac.failed === 0,
                `total=${r1.total} sizes=${[...new Set(r1.sizes)].join(',')} | ${ac.failures.join('；')}`);
        }

        // ---------- I2 关键元素图标齐全 ----------
        {
            const sels = [
                '#group-sidebar .panel-head svg[data-icon="shapes"]',
                '#sidebar .panel-head svg[data-icon="atom"]',
                '#inspect-panel .panel-head svg[data-icon="eye"]',
                '#input-panel-toggle svg[data-icon="x"]',
                '#btn-open-input svg[data-icon="flask-conical"]',
                '#btn-optimize-all svg[data-icon="sparkles"]',
                '#btn-clear-molecule svg[data-icon="trash-2"]',
                '#btn-undo svg[data-icon="undo-2"]',
                '#btn-redo svg[data-icon="redo-2"]',
                '#btn-help svg[data-icon="circle-help"]',
                '#help-close svg[data-icon="x"]',
                '#btn-open-keypad svg[data-icon="keyboard"]',
                '#formula-keypad-backspace svg[data-icon="delete"]',
                '#formula-keypad-close svg[data-icon="x"]',
                '#isomer-panel-close svg[data-icon="x"]',
                '#candidate-panel-close svg[data-icon="x"]',
                '#btn-flip-cistrans svg[data-icon="arrow-left-right"]',
                '#smiles-help-toggle svg[data-icon="circle-help"]',
                '.clear-btn[data-clear="name-input"] svg[data-icon="x"]',
                '.clear-btn[data-clear="smiles-input"] svg[data-icon="x"]',
                '.clear-btn[data-clear="formula-input"] svg[data-icon="x"]',
                '#mobilebar #mb-build svg[data-icon="shapes"]',
                '#mobilebar #mb-inspect svg[data-icon="eye"]',
                '#mobilebar #mb-generate svg[data-icon="flask-conical"]',
                '#help-card svg[data-icon="mouse"]',
                '#help-card svg[data-icon="keyboard"]',
                '#help-card svg[data-icon="hand"]',
                '#help-card svg[data-icon="lightbulb"]',
                '#group-sidebar .panel-caret svg[data-icon="chevron-left"]',
                '#inspect-panel .panel-caret svg[data-icon="chevron-right"]'
            ];
            const missing = await page.evaluate((sels) => sels.filter(s => !document.querySelector(s)), sels);
            const ac = new AssertionCollector();
            ac.ok(missing.length === 0, `缺失 ${missing.length}：${missing.join(' | ')}`);
            push('I2 关键元素图标齐全', ac.failed === 0, `${sels.length - missing.length}/${sels.length} 命中 | ${ac.failures.join('；')}`);
        }

        // ---------- I3 可见 UI 文本无残留 emoji/符号 ----------
        {
            const r3 = await page.evaluate(() => {
                const legacy = /[📖🧪⚙✨🗑⌨⌫⇄🖱✋💡❔✕◐⚛▾▴✓×]/;
                const targets = {
                    'group-sidebar-head': '#group-sidebar .panel-head',
                    'sidebar-head': '#sidebar .panel-head',
                    'inspect-head': '#inspect-panel .panel-head',
                    'input-panel-toggle': '#input-panel-toggle',
                    'btn-open-input': '#btn-open-input',
                    'smiles-help-toggle': '#smiles-help-toggle',
                    'btn-optimize-all': '#btn-optimize-all',
                    'btn-clear-molecule': '#btn-clear-molecule',
                    'btn-open-keypad': '#btn-open-keypad',
                    'formula-keypad-backspace': '#formula-keypad-backspace',
                    'formula-keypad-close': '#formula-keypad-close',
                    'isomer-panel-close': '#isomer-panel-close',
                    'candidate-panel-close': '#candidate-panel-close',
                    'btn-flip-cistrans': '#btn-flip-cistrans',
                    'help-h3': '#help-card h3',
                    'help-card-top': '#help-card h2',
                    'clear-btn': '.clear-btn',
                    'btn-toggle-hydro': '#btn-toggle-hydro',
                    'btn-toggle-lp': '#btn-toggle-lp',
                    'btn-toggle-grid': '#btn-toggle-grid',
                    'btn-toggle-deloc': '#btn-toggle-deloc',
                    'mobilebar': '#mobilebar'
                };
                const bad = [];
                for (const [k, sel] of Object.entries(targets)) {
                    const els = [...document.querySelectorAll(sel)];
                    for (const el of els) {
                        const t = el.textContent || '';
                        if (legacy.test(t)) bad.push(k + '="' + t.trim().slice(0, 30) + '"');
                    }
                }
                const bothPi = [...document.querySelectorAll('#btn-toggle-pi')].map(el => el.textContent.trim());
                const helpBtnText = document.getElementById('btn-help').textContent.trim();
                return { bad, bothPi, helpBtnText };
            });
            const ac = new AssertionCollector();
            ac.ok(r3.bad.length === 0, `无残留符号（发现：${r3.bad.join(' | ')}）`);
            ac.ok(r3.helpBtnText === '', `btn-help 文本为空（实际 "${r3.helpBtnText}"）`);
            ac.ok(r3.bothPi.length === 1, `唯一 btn-toggle-pi（检查器视图段）无符号（"${r3.bothPi.join(' / ')}"）`);
            push('I3 文本无残留 emoji/符号', ac.failed === 0,
                `pi="${r3.bothPi.join(' / ')}" help="${r3.helpBtnText}" | ${ac.failures.join('；')}`);
        }

        // ---------- I4 视图开关：28×16 滑块，勾选后滑块右移 + 琥珀描边 ----------
        {
            const readSwitch = () => page.evaluate(() => {
                const chk = document.getElementById('chk-grid');
                const sw = chk.nextElementSibling;
                const cs = getComputedStyle(sw);
                const af = getComputedStyle(sw, '::after');
                return { w: Math.round(parseFloat(cs.width)), h: Math.round(parseFloat(cs.height)), border: cs.borderTopColor, knob: af.transform, knobBg: af.backgroundColor, checked: chk.checked, cls: sw.className, rows: document.querySelectorAll('#inspect-body .toggle-row .switch').length };
            });
            await page.evaluate(() => { document.getElementById('chk-grid').checked = false; });
            await page.waitForTimeout(260);
            const off = await readSwitch();
            await page.evaluate(() => { document.getElementById('chk-grid').checked = true; });
            await page.waitForTimeout(260);
            const on = await readSwitch();
            await page.evaluate(() => { document.getElementById('chk-grid').checked = false; });
            const ac = new AssertionCollector();
            ac.ok(off.cls === 'switch' && off.rows === 5, `5 个视图开关均为 .switch（实际 ${off.rows}）`);
            ac.ok(off.w === 28 && off.h === 16, `开关 28×16（实际 ${off.w}×${off.h}）`);
            ac.ok(on.knob !== off.knob && /matrix\(1, 0, 0, 1, 12/.test(on.knob), `勾选后滑块右移 12px（${off.knob} → ${on.knob}）`);
            ac.ok(on.border !== off.border && /240, 180, 90/.test(on.border), `勾选后描边变琥珀（${off.border} → ${on.border}）`);
            ac.ok(on.knobBg !== off.knobBg, `勾选后滑块变亮（${off.knobBg} → ${on.knobBg}）`);
            push('I4 视图开关滑块（28×16，勾选右移 + 琥珀描边）', ac.failed === 0, JSON.stringify({ off, on }) + ' | ' + ac.failures.join('；'));
        }

        // ---------- I5 折叠交互：面板 caret 翻转 + 抽屉开合 ----------
        {
            const ac = new AssertionCollector();
            const detail = {};
            const caretOf = (sel) => page.evaluate((s) => {
                const el = document.querySelector(s);
                const svg = el && el.querySelector('svg[data-icon]');
                return { icon: svg ? svg.dataset.icon : null, svg: !!svg };
            }, sel);

            // 构建台：展开 chevron-left → 点击收起 chevron-right → 再点展开
            detail.b0 = await caretOf('#group-sidebar .panel-caret');
            await page.click('#group-sidebar-toggle');
            await page.waitForTimeout(320);
            detail.b1 = await caretOf('#group-sidebar .panel-caret');
            detail.b1collapsed = await page.evaluate(() => document.getElementById('build-panel').classList.contains('collapsed'));
            await page.click('#group-sidebar-toggle');
            await page.waitForTimeout(320);
            detail.b2 = await caretOf('#group-sidebar .panel-caret');

            // 检查器：展开 chevron-right → 点击收起 chevron-left → 再点展开
            detail.i0 = await caretOf('#inspect-panel .panel-caret');
            await page.click('#inspect-toggle');
            await page.waitForTimeout(320);
            detail.i1 = await caretOf('#inspect-panel .panel-caret');
            detail.i1collapsed = await page.evaluate(() => document.getElementById('inspect-panel').classList.contains('collapsed'));
            await page.click('#inspect-toggle');
            await page.waitForTimeout(320);
            detail.i2 = await caretOf('#inspect-panel .panel-caret');

            // 生成抽屉：按钮 aria-expanded 同步，关闭按钮图标为 x
            await page.evaluate(() => window.__setInputPanelOpen(true));
            await page.waitForTimeout(220);
            detail.d0 = await page.evaluate(() => ({
                open: document.getElementById('input-panel').classList.contains('open'),
                aria: document.getElementById('btn-open-input').getAttribute('aria-expanded'),
                closeIcon: !!document.querySelector('#input-panel-toggle svg[data-icon="x"]')
            }));
            await page.evaluate(() => window.__setInputPanelOpen(false));
            await page.waitForTimeout(220);
            detail.d1 = await page.evaluate(() => ({
                open: document.getElementById('input-panel').classList.contains('open'),
                aria: document.getElementById('btn-open-input').getAttribute('aria-expanded')
            }));

            ac.ok(detail.b0.icon === 'chevron-left' && detail.b0.svg, '构建台展开时 caret=chevron-left（已水合）');
            ac.ok(detail.b1.icon === 'chevron-right' && detail.b1collapsed, '构建台收起后 caret=chevron-right + 面板 collapsed');
            ac.ok(detail.b2.icon === 'chevron-left', '构建台再点回 chevron-left');
            ac.ok(detail.i0.icon === 'chevron-right' && detail.i0.svg, '检查器展开时 caret=chevron-right（已水合）');
            ac.ok(detail.i1.icon === 'chevron-left' && detail.i1collapsed, '检查器收起后 caret=chevron-left + 面板 collapsed');
            ac.ok(detail.i2.icon === 'chevron-right', '检查器再点回 chevron-right');
            ac.ok(detail.d0.open && detail.d0.aria === 'true' && detail.d0.closeIcon, '抽屉打开 + aria-expanded=true + 关闭按钮 x 图标');
            ac.ok(!detail.d1.open && detail.d1.aria === 'false', '抽屉关闭 + aria-expanded=false');
            push('I5 面板 caret 翻转 + 抽屉开合图标', ac.failed === 0, JSON.stringify(detail) + ' | ' + ac.failures.join('；'));
        }

        // ---------- I6 帮助面板开合 ----------
        {
            const ac = new AssertionCollector();
            const st0 = await page.evaluate(() => getComputedStyle(document.getElementById('help-overlay')).display);
            await page.click('#btn-help');
            await page.waitForTimeout(200);
            const st1 = await page.evaluate(() => getComputedStyle(document.getElementById('help-overlay')).display);
            await page.click('#help-close');
            await page.waitForFunction(() => window.__ddAnim && window.__ddAnim.idle(), null, { timeout: 5000 });
            const st2 = await page.evaluate(() => getComputedStyle(document.getElementById('help-overlay')).display);
            ac.ok(st0 === 'none', `初始关闭（${st0}）`);
            ac.ok(st1 === 'flex', `点击 ? 图标后打开（${st1}）`);
            ac.ok(st2 === 'none', `点击 ✕ 图标后关闭（${st2}）`);
            push('I6 帮助面板开合', ac.failed === 0, `none→${st1}→${st2} | ${ac.failures.join('；')}`);
        }

        // ---------- I7 删除图标内层含 Lucide trash-2 ----------
        {
            const ac = new AssertionCollector();
            await page.evaluate(() => {
                try { window.__setInputPanelOpen && window.__setInputPanelOpen(false); } catch (e) {}
                window.__diag.generate('methane');
            });
            await page.waitForTimeout(400);
            const sp = await page.evaluate(() => {
                const atoms = window.__dragMode.atoms();
                const a0 = atoms.find(a => a.t === 'H') || atoms[0];
                return window.__dragMode.project(a0.p[0], a0.p[1], a0.p[2]);
            });
            await page.mouse.click(sp.x, sp.y);
            await page.waitForTimeout(600);
            const r7 = await page.evaluate(() => {
                const el = document.querySelector('[title="删除选中原子"]');
                const inner = el && el.firstElementChild;
                const svg = el && el.querySelector('svg[data-icon="trash-2"]');
                return {
                    found: !!el,
                    innerHasSvg: !!(inner && inner.querySelector('svg')),
                    svgDecoded: svg ? svg.outerHTML.slice(0, 70) : null,
                    innerSize: inner ? inner.getBoundingClientRect().width.toFixed(0) : null
                };
            });
            ac.ok(r7.found, '选中原子后图标出现');
            ac.ok(r7.innerHasSvg, '内层含 SVG（不再是 ✕ 文本）');
            ac.ok(!!r7.svgDecoded, `SVG 为 Lucide trash-2（${r7.svgDecoded}）`);
            push('I7 删除图标内嵌 Lucide trash-2', ac.failed === 0, JSON.stringify(r7) + ' | ' + ac.failures.join('；'));
        }
    } catch (e) {
        report.failed = report.total = 1;
        report.results.push({ name: '页面加载/执行', pass: false, detail: 'FATAL: ' + String(e).slice(0, 400) });
    }

    // ---------- I8 控制台零错误 ----------
    push('I8 控制台零错误', report.consoleErrors.length === 0,
        report.consoleErrors.length ? report.consoleErrors.slice(0, 5).join(' | ') : '无');

    report.elapsedMs = Date.now() - t0;
    await browser.close();
    if (serverProc) { try { serverProc.kill(); } catch (e) {} }

    console.log(JSON.stringify(report, null, 1));
    if (report.failed > 0) process.exitCode = 1;
})().catch(e => { console.error('FATAL', e); process.exit(1); });
