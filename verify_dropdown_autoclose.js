// verify_dropdown_autoclose.js — 角落下拉浮层「点击别处自动收起」验证（2026-10-20）
// 覆盖：使用说明 / 设置 / 名称·SMILES 三个可折叠浮层点画布自动收起、浮层内部点击不收起、
//       标题开关仍可正常开合、展开另一个浮层时前一个自动收起（手风琴）、
//       分子式小键盘随输入面板联动（点面板其他输入框收起、开关按钮可开可关、按键点击不误关）、
//       原生 select 点别处仍失焦、零 console 错误。
// 运行：cmd /c "node verify_dropdown_autoclose.js > verify_dropdown_autoclose.json 2>&1"（timeout 900000ms）
const { chromium } = require('playwright');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 8061;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=dropdown1`;

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
    const t0 = Date.now();
    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => !!(window.__diag && window.__history && window.__showFormulaKeypad && document.getElementById('formula-input')), null, { timeout: 30000 });
        await page.waitForTimeout(600);

        const state = () => page.evaluate(() => {
            const has = (sel) => !!document.querySelector(sel);
            const disp = (id) => { const el = document.getElementById(id); return el ? getComputedStyle(el).display : null; };
            return {
                guideOpen: document.getElementById('guide-body').classList.contains('open'),
                settingsOpen: document.getElementById('settings-body').classList.contains('open'),
                inputOpen: document.getElementById('input-panel').classList.contains('open'),
                inputBodyDisp: disp('input-panel-body'),
                keypad: disp('formula-keypad'),
                carets: {
                    g: has('#guide-toggle svg[data-icon="chevron-up"]') ? 'up' : (has('#guide-toggle svg[data-icon="chevron-down"]') ? 'down' : '?'),
                    s: has('#settings-toggle svg[data-icon="chevron-up"]') ? 'up' : (has('#settings-toggle svg[data-icon="chevron-down"]') ? 'down' : '?'),
                    i: has('#input-panel-toggle svg[data-icon="chevron-up"]') ? 'up' : (has('#input-panel-toggle svg[data-icon="chevron-down"]') ? 'down' : '?')
                },
                active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null
            };
        });
        const clickCanvas = async () => {
            await page.mouse.click(760, 520);
            // 收起是延迟 display:none 的（开合动画），等动画队列清空再读状态
            await page.waitForFunction(() => window.__ddAnim && window.__ddAnim.idle(), null, { timeout: 5000 });
        };

        // 归零：关闭全部浮层（webdriver 环境输入面板默认展开）
        await page.evaluate(() => window.__setInputPanelOpen(false));
        await page.waitForFunction(() => window.__ddAnim && window.__ddAnim.idle(), null, { timeout: 5000 });

        // D1 使用说明：展开 → 点画布 → 自动收起
        await page.click('#guide-toggle');
        await page.waitForTimeout(180);
        const d1a = await state();
        await clickCanvas();
        const d1b = await state();
        step('D1 使用说明：展开→点画布自动收起（caret 复位）',
            d1a.guideOpen && d1a.carets.g === 'up' && !d1b.guideOpen && d1b.carets.g === 'down' && d1b.inputOpen === false,
            { open: d1a.guideOpen, caretOpen: d1a.carets.g, closed: !d1b.guideOpen, caretClosed: d1b.carets.g });

        // D2 设置：展开 → 点画布 → 自动收起
        await page.click('#settings-toggle');
        await page.waitForTimeout(180);
        const d2a = await state();
        await clickCanvas();
        const d2b = await state();
        step('D2 设置：展开→点画布自动收起（caret 复位）',
            d2a.settingsOpen && d2a.carets.s === 'up' && !d2b.settingsOpen && d2b.carets.s === 'down',
            { open: d2a.settingsOpen, caretOpen: d2a.carets.s, closed: !d2b.settingsOpen, caretClosed: d2b.carets.s });

        // D3 名称 / SMILES：展开 → 点画布 → 自动收起
        await page.evaluate(() => window.__setInputPanelOpen(true));
        await page.waitForTimeout(200);
        const d3a = await state();
        await clickCanvas();
        const d3b = await state();
        step('D3 名称/SMILES：展开→点画布自动收起（body 隐藏 + caret 复位）',
            d3a.inputOpen && d3a.inputBodyDisp !== 'none' && d3a.carets.i === 'up'
            && !d3b.inputOpen && d3b.inputBodyDisp === 'none' && d3b.carets.i === 'down',
            { open: d3a.inputOpen, bodyOpen: d3a.inputBodyDisp, caretOpen: d3a.carets.i, closed: !d3b.inputOpen, caretClosed: d3b.carets.i });

        // D4 浮层内部点击不收起（点在内容区留白处）
        await page.click('#settings-toggle');
        await page.waitForTimeout(150);
        await page.click('#settings-body', { position: { x: 4, y: 4 } });
        await page.waitForTimeout(180);
        const d4a = await state();
        await page.click('#guide-toggle');
        await page.waitForTimeout(150);
        await page.click('#guide-body', { position: { x: 4, y: 4 } });
        await page.waitForTimeout(180);
        const d4b = await state();
        step('D4 浮层内部点击保持展开（设置/说明各一次）',
            d4a.settingsOpen && d4a.carets.s === 'up' && d4b.guideOpen && d4b.carets.g === 'up',
            { settingsAfterInside: d4a.settingsOpen, guideAfterInside: d4b.guideOpen });

        // D5 标题开关仍可正常开合（说明面板：先归零到收起，再点开→点关）
        const d5pre = await state();
        if (d5pre.guideOpen) { await page.click('#guide-toggle'); await page.waitForTimeout(150); }
        await page.click('#guide-toggle');
        await page.waitForTimeout(180);
        const d5a = await state();
        await page.click('#guide-toggle');
        await page.waitForTimeout(180);
        const d5b = await state();
        step('D5 标题开关不被自动收起逻辑打断（开→关）',
            d5a.guideOpen && d5a.carets.g === 'up' && !d5b.guideOpen && d5b.carets.g === 'down',
            { opened: d5a.guideOpen, caretOpen: d5a.carets.g, closed: !d5b.guideOpen, caretClosed: d5b.carets.g });

        // D6 展开另一个浮层 → 前一个自动收起（手风琴）
        await page.click('#guide-toggle');
        await page.waitForTimeout(150);
        await page.click('#settings-toggle');
        await page.waitForTimeout(200);
        const d6 = await state();
        step('D6 展开设置时使用说明自动收起（一次只弹一个）',
            !d6.guideOpen && d6.settingsOpen && d6.carets.g === 'down' && d6.carets.s === 'up',
            { guide: d6.guideOpen, settings: d6.settingsOpen, carets: d6.carets });
        await clickCanvas();

        // D7 分子式小键盘联动：输入面板内点其他输入框 → 小键盘收起、面板保持；开关按钮可开可关
        await page.evaluate(() => window.__setInputPanelOpen(true));
        await page.waitForTimeout(200);
        await page.fill('#formula-input', '');
        await page.click('#formula-input');
        await page.waitForTimeout(220);
        const d7a = await state();
        await page.click('#name-input');
        await page.waitForTimeout(220);
        const d7b = await state();
        await page.click('#btn-open-keypad');
        await page.waitForTimeout(220);
        const d7c = await state();
        await page.click('#btn-open-keypad');
        await page.waitForTimeout(220);
        const d7d = await state();
        step('D7 小键盘：点名称输入框收起 / 面板保持；开关按钮可开可关',
            d7a.keypad !== 'none' && d7b.keypad === 'none' && d7b.inputOpen
            && d7c.keypad !== 'none' && d7c.inputOpen && d7d.keypad === 'none' && d7d.inputOpen,
            { afterFormula: d7a.keypad, afterName: d7b.keypad, panelAfterName: d7b.inputOpen, afterToggleOn: d7c.keypad, afterToggleOff: d7d.keypad, panelAfterToggle: d7d.inputOpen });

        // D8 点小键盘按键不误关（键盘保持、面板保持、焦点留在输入框）
        await page.click('#btn-open-keypad');
        await page.waitForTimeout(200);
        await page.click('#formula-keypad-els .fkp-key >> nth=0');   // C
        await page.waitForTimeout(220);
        const d8 = await page.evaluate(() => ({
            value: document.getElementById('formula-input').value,
            keypad: getComputedStyle(document.getElementById('formula-keypad')).display,
            inputOpen: document.getElementById('input-panel').classList.contains('open'),
            active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null
        }));
        step('D8 点小键盘按键：键盘/面板保持、输入框追加且焦点不丢',
            d8.value.includes('C') && d8.keypad !== 'none' && d8.inputOpen && d8.active === 'formula-input',
            d8);

        // D9 点画布：输入面板与小键盘一起收起
        await clickCanvas();
        const d9 = await state();
        step('D9 点画布：输入面板收起且小键盘同步隐藏',
            !d9.inputOpen && d9.keypad === 'none' && d9.inputBodyDisp === 'none',
            { inputOpen: d9.inputOpen, keypad: d9.keypad, body: d9.inputBodyDisp });

        // D10 原生 select：点别处仍失焦（既有行为不回退）
        await page.click('#settings-toggle');
        await page.waitForTimeout(200);
        await page.click('#atom-style-select');
        await page.waitForTimeout(250);
        const d10a = await state();
        await page.click('#settings-body', { position: { x: 4, y: 4 } });  // 面板内点击不收起
        await page.waitForTimeout(180);
        const d10b = await state();
        await clickCanvas();
        const d10c = await state();
        step('D10 原生 select 点画布失焦 + 设置面板照常自动收起',
            d10a.active === 'atom-style-select' && d10b.active !== 'atom-style-select' && d10b.settingsOpen && d10c.active !== 'atom-style-select' && !d10c.settingsOpen,
            { openActive: d10a.active, afterInside: d10b.active, settingsStay: d10b.settingsOpen, afterCanvas: d10c.active, settingsClosed: !d10c.settingsOpen });

        // D11 零 console 错误
        step('D11 零 console 错误', report.consoleErrors.length === 0, report.consoleErrors);
    } catch (e) {
        report.results.push({ name: 'FATAL', ok: false, detail: String(e && e.stack || e).slice(0, 1200) });
    } finally {
        await browser.close().catch(() => {});
        if (serverProc) try { serverProc.kill(); } catch (e) {}
    }
    const passed = report.results.filter(r => r.ok).length;
    report.passed = passed; report.failed = report.results.length - passed; report.total = report.results.length;
    report.elapsedMs = Date.now() - t0;
    for (const r of report.results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
    for (const r of report.results) if (!r.ok) console.log('   detail: ' + JSON.stringify(r.detail));
    console.log(`\n== verify_dropdown_autoclose: ${passed}/${report.total} passed, ${report.failed} failed (${report.elapsedMs}ms) ==`);
    require('fs').writeFileSync('verify_dropdown_autoclose.json', JSON.stringify(report, null, 1));
    process.exit(report.failed ? 1 : 0);
})();
