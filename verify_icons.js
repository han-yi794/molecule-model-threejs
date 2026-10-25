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
            () => !!(window.__diag && window.__iconSvg && document.getElementById('guide-toggle')),
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
                '#guide-toggle svg[data-icon="book-open"]',
                '#settings-toggle svg[data-icon="settings"]',
                '#input-panel-toggle svg[data-icon="flask-conical"]',
                '#btn-optimize-all svg[data-icon="sparkles"]',
                '#btn-clear-molecule svg[data-icon="trash-2"]',
                '#btn-undo svg[data-icon="undo-2"]',
                '#btn-redo svg[data-icon="redo-2"]',
                '#btn-help svg[data-icon="circle-help"]',
                '#help-close svg[data-icon="x"]',
                '#group-sidebar .title svg[data-icon="shapes"]',
                '#sidebar .title svg[data-icon="atom"]',
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
                '#settings-body svg[data-icon="wand-sparkles"]',
                '#settings-body svg[data-icon="cloud"]',
                '#settings-body svg[data-icon="grid-3x3"]',
                '#settings-body svg[data-icon="orbit"]',
                '#settings-body svg[data-icon="palette"]',
                '#help-card svg[data-icon="mouse"]',
                '#help-card svg[data-icon="keyboard"]',
                '#help-card svg[data-icon="hand"]',
                '#help-card svg[data-icon="lightbulb"]',
                '#settings-body svg[data-icon="eye"]'
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
                    'guide-toggle': '#guide-toggle',
                    'settings-toggle': '#settings-toggle',
                    'input-panel-toggle': '#input-panel-toggle',
                    'smiles-help-toggle': '#smiles-help-toggle',
                    'btn-optimize-all': '#btn-optimize-all',
                    'btn-clear-molecule': '#btn-clear-molecule',
                    'group-sidebar-title': '#group-sidebar .title',
                    'sidebar-title': '#sidebar .title',
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
                    'btn-toggle-deloc': '#btn-toggle-deloc'
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
            ac.ok(r3.bothPi.length === 1, `唯一 btn-toggle-pi（设置面板）无符号（"${r3.bothPi.join(' / ')}"）`);
            push('I3 文本无残留 emoji/符号', ac.failed === 0,
                `pi="${r3.bothPi.join(' / ')}" help="${r3.helpBtnText}" | ${ac.failures.join('；')}`);
        }

        // ---------- I4 勾选框选中态为 SVG 对勾 ----------
        {
            const r4 = await page.evaluate(() => {
                const chk = document.getElementById('chk-grid');
                const box = chk.nextElementSibling; // .check-box
                const before = getComputedStyle(box, '::after').backgroundImage;
                chk.checked = true;
                const after = getComputedStyle(box, '::after').backgroundImage;
                chk.checked = false;
                return { before, after };
            });
            const ac = new AssertionCollector();
            ac.ok(r4.after !== 'none', `选中态 ::after 有背景（实际 ${String(r4.after).slice(0, 60)}）`);
            ac.ok(r4.after.includes('data:image/svg+xml'), `选中态为 SVG 图像（实际 ${String(r4.after).slice(0, 60)}）`);
            push('I4 勾选框 SVG 对勾', ac.failed === 0, JSON.stringify(r4).slice(0, 220) + ' | ' + ac.failures.join('；'));
        }

        // ---------- I5 折叠交互：chevron 翻转 ----------
        {
            const ac = new AssertionCollector();
            const detail = {};

            // 使用说明：默认收起（chevron-down）→ 点击展开（chevron-up）→ 再点收起
            detail.guide0 = await page.evaluate(() => ({
                down: !!document.querySelector('#guide-toggle svg[data-icon="chevron-down"]'),
                up: !!document.querySelector('#guide-toggle svg[data-icon="chevron-up"]')
            }));
            await page.click('#guide-toggle');
            detail.guide1 = await page.evaluate(() => ({
                down: !!document.querySelector('#guide-toggle svg[data-icon="chevron-down"]'),
                up: !!document.querySelector('#guide-toggle svg[data-icon="chevron-up"]'),
                open: document.getElementById('guide-body').classList.contains('open')
            }));
            await page.click('#guide-toggle');
            detail.guide2 = await page.evaluate(() => !!document.querySelector('#guide-toggle svg[data-icon="chevron-down"]'));

            // 设置：默认无 chevron → 点击展开（chevron-up）→ 再点收起（无 chevron）
            detail.set0 = await page.evaluate(() => !!document.querySelector('#settings-toggle svg'));
            await page.click('#settings-toggle');
            detail.set1 = await page.evaluate(() => ({
                up: !!document.querySelector('#settings-toggle svg[data-icon="chevron-up"]'),
                open: document.getElementById('settings-body').classList.contains('open')
            }));
            await page.click('#settings-toggle');
            detail.set2 = await page.evaluate(() => ({
                up: !!document.querySelector('#settings-toggle svg[data-icon="chevron-up"]'),
                open: document.getElementById('settings-body').classList.contains('open')
            }));

            // 输入面板：webdriver 环境默认展开（chevron-up）→ 点击收起（down）→ 再点展开（up）
            // 2026-10-20 手风琴：前面点开设置/说明会让输入面板自动收起，先显式展开再验开合
            await page.evaluate(() => window.__setInputPanelOpen(true));
            await page.waitForTimeout(120);
            detail.in0 = await page.evaluate(() => ({
                up: !!document.querySelector('#input-panel-toggle svg[data-icon="chevron-up"]'),
                open: document.getElementById('input-panel').classList.contains('open')
            }));
            await page.click('#input-panel-toggle');
            detail.in1 = await page.evaluate(() => ({
                down: !!document.querySelector('#input-panel-toggle svg[data-icon="chevron-down"]'),
                open: document.getElementById('input-panel').classList.contains('open')
            }));
            await page.click('#input-panel-toggle');
            detail.in2 = await page.evaluate(() => !!document.querySelector('#input-panel-toggle svg[data-icon="chevron-up"]'));

            ac.ok(detail.guide0.down && !detail.guide0.up, '说明初始 chevron-down');
            ac.ok(detail.guide1.up && detail.guide1.open, '说明展开后 chevron-up + 内容开');
            ac.ok(detail.guide2, '说明再点回 chevron-down');
            ac.ok(detail.set0, '设置初始有 svg 图标（无 chevron）');
            ac.ok(detail.set1.up && detail.set1.open, '设置展开后 chevron-up + 内容开');
            ac.ok(!detail.set2.up && !detail.set2.open, '设置再点收起（无 chevron + 内容关）');
            ac.ok(detail.in0.up && detail.in0.open, '输入面板初始展开 chevron-up（webdriver）');
            ac.ok(detail.in1.down && !detail.in1.open, '输入面板收起 chevron-down');
            ac.ok(detail.in2, '输入面板再点展开 chevron-up');
            push('I5 折叠交互 chevron 翻转', ac.failed === 0, JSON.stringify(detail) + ' | ' + ac.failures.join('；'));
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
