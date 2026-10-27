// verify_dropdown_autoclose.js — 浮层「点击别处自动收起」验证（2026-10-27 三栏重设计版）
// 语义变化：旧版三个角落浮层（使用说明/设置/名称·SMILES）已删除，可收起浮层只剩
//   右侧生成抽屉 #input-panel 与分子式小键盘 #formula-keypad。
// 覆盖：抽屉点画布自动收起、抽屉内部点击保持、顶栏「生成…」开关不被拦截、
//       小键盘随抽屉联动（点其他输入框收起、开关按钮可开可关、按键点击不误关）、
//       手机底部栏「生成」按钮开合、原生 select 点画布失焦（检查器常驻）、
//       面板折叠状态不被点画布影响、零 console 错误。
// 运行：cmd /c "node verify_dropdown_autoclose.js > verify_dropdown_autoclose.json 2>&1"（timeout 900000ms）
const { chromium } = require('playwright');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 8061;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=dropdown2`;

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
        await page.waitForFunction(() => !!(window.__diag && window.__panels && window.__showFormulaKeypad && document.getElementById('formula-input')), null, { timeout: 30000 });
        await page.waitForTimeout(600);

        const state = () => page.evaluate(() => {
            const disp = (id) => { const el = document.getElementById(id); return el ? getComputedStyle(el).display : null; };
            const drawer = document.getElementById('input-panel');
            return {
                inputOpen: drawer.classList.contains('open'),
                inputVis: getComputedStyle(drawer).visibility,
                keypad: disp('formula-keypad'),
                active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
                panels: window.__panels.state()
            };
        });
        const clickCanvas = async () => {
            await page.mouse.click(760, 520);
            // 抽屉收起是 190ms transform+visibility 过渡；visibility 在过渡结束才 hidden
            await page.waitForFunction(() => {
                const el = document.getElementById('input-panel');
                return el && !el.classList.contains('open') && getComputedStyle(el).visibility === 'hidden';
            }, null, { timeout: 5000 });
        };

        // 归零：关闭抽屉（webdriver 环境抽屉默认展开）
        await page.evaluate(() => window.__setInputPanelOpen(false));
        await page.waitForTimeout(260);

        // D1 生成抽屉：打开 → 点画布 → 自动收起
        await page.click('#btn-open-input');
        await page.waitForTimeout(260);
        const d1a = await state();
        await clickCanvas();
        const d1b = await state();
        step('D1 生成抽屉：打开→点画布自动收起（visibility 过渡后 hidden）',
            d1a.inputOpen && d1a.inputVis === 'visible' && !d1b.inputOpen && d1b.inputVis === 'hidden',
            { open: d1a.inputOpen, openVis: d1a.inputVis, closed: !d1b.inputOpen, closedVis: d1b.inputVis });

        // D2 抽屉内部点击不收起（点在内容区留白处）
        await page.evaluate(() => window.__setInputPanelOpen(true));
        await page.waitForTimeout(240);
        await page.click('#input-panel-body', { position: { x: 4, y: 4 } });
        await page.waitForTimeout(260);
        const d2 = await state();
        step('D2 抽屉内部点击保持展开', d2.inputOpen && d2.inputVis === 'visible', { open: d2.inputOpen, vis: d2.inputVis });

        // D3 顶栏「生成…」按钮是开关本身：不被 mousedown 自动收起拦截
        await page.click('#btn-open-input');       // 关闭
        await page.waitForTimeout(260);
        const d3a = await state();
        await page.click('#btn-open-input');       // 再打开
        await page.waitForTimeout(260);
        const d3b = await state();
        step('D3 顶栏「生成…」开关不被自动收起拦截（开→关→开）',
            !d3a.inputOpen && d3b.inputOpen && d3b.inputVis === 'visible',
            { afterClose: d3a.inputOpen, afterOpen: d3b.inputOpen });

        // D4 点画布：抽屉与小键盘一起收起
        await page.click('#formula-input');
        await page.waitForTimeout(240);
        const d4a = await state();
        await clickCanvas();
        const d4b = await state();
        step('D4 点画布：抽屉收起且小键盘同步隐藏',
            d4a.inputOpen && d4a.keypad !== 'none' && !d4b.inputOpen && d4b.keypad === 'none',
            { keypadOpen: d4a.keypad, inputAfter: d4b.inputOpen, keypadAfter: d4b.keypad });

        // D5 小键盘联动：抽屉内点名称输入框 → 小键盘收起、抽屉保持
        await page.evaluate(() => window.__setInputPanelOpen(true));
        await page.waitForTimeout(240);
        await page.fill('#formula-input', '');
        await page.click('#formula-input');
        await page.waitForTimeout(240);
        const d5a = await state();
        await page.click('#name-input');
        await page.waitForTimeout(240);
        const d5b = await state();
        step('D5 小键盘：点名称输入框收起小键盘、抽屉保持展开',
            d5a.keypad !== 'none' && d5b.keypad === 'none' && d5b.inputOpen,
            { afterFormula: d5a.keypad, afterName: d5b.keypad, panelAfterName: d5b.inputOpen });

        // D6 小键盘开关按钮可开可关（按钮自身不被白名单误排除）
        await page.click('#btn-open-keypad');
        await page.waitForTimeout(240);
        const d6a = await state();
        await page.click('#btn-open-keypad');
        await page.waitForTimeout(240);
        const d6b = await state();
        step('D6 小键盘开关按钮可开可关（抽屉始终展开）',
            d6a.keypad !== 'none' && d6a.inputOpen && d6b.keypad === 'none' && d6b.inputOpen,
            { afterOn: d6a.keypad, afterOff: d6b.keypad, panel: d6b.inputOpen });

        // D7 点小键盘按键不误关（键盘保持、抽屉保持、焦点留在输入框）
        await page.click('#btn-open-keypad');
        await page.waitForTimeout(220);
        await page.click('#formula-keypad-els .fkp-key >> nth=0');   // C
        await page.waitForTimeout(240);
        const d7 = await page.evaluate(() => ({
            value: document.getElementById('formula-input').value,
            keypad: getComputedStyle(document.getElementById('formula-keypad')).display,
            inputOpen: document.getElementById('input-panel').classList.contains('open'),
            active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null
        }));
        step('D7 点小键盘按键：键盘/抽屉保持、输入框追加且焦点不丢',
            d7.value.includes('C') && d7.keypad !== 'none' && d7.inputOpen && d7.active === 'formula-input',
            d7);

        // D8 手机：底部栏「生成」按钮开合抽屉，点画布收起
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(400);
        await page.evaluate(() => window.__setInputPanelOpen(false));
        await page.waitForTimeout(260);
        await page.click('#mb-generate');
        await page.waitForTimeout(300);
        const d8a = await state();
        await page.mouse.click(200, 260);
        await page.waitForTimeout(300);
        const d8b = await state();
        const mbActive = await page.evaluate(() => [...document.querySelectorAll('#mobilebar .mb-btn')].map(b => ({ id: b.id, active: b.classList.contains('active') })));
        step('D8 390 手机：底部栏「生成」打开抽屉、点画布收起（无 sheet 残留高亮）',
            d8a.inputOpen && d8a.inputVis === 'visible' && !d8b.inputOpen
            && mbActive.every(b => !b.active),
            { open: d8a.inputOpen, closed: !d8b.inputOpen, mb: mbActive });

        // D9 原生 select：点画布仍失焦，检查器常驻不收起
        await page.setViewportSize({ width: 1289, height: 896 });
        await page.waitForTimeout(420);
        await page.click('#atom-style-select');
        await page.waitForTimeout(240);
        const d9a = await state();
        await clickCanvas();
        const d9b = await state();
        const ins = await page.evaluate(() => ({
            body: getComputedStyle(document.getElementById('inspect-body')).display,
            panel: getComputedStyle(document.getElementById('inspect-panel')).display
        }));
        step('D9 原生 select 点画布失焦 + 检查器常驻',
            d9a.active === 'atom-style-select' && d9b.active !== 'atom-style-select'
            && ins.body !== 'none' && ins.panel !== 'none',
            { openActive: d9a.active, afterCanvas: d9b.active, inspect: ins });

        // D10 面板折叠状态不被点画布影响
        await page.evaluate(() => window.__panels.set('build', true));
        await page.waitForTimeout(340);
        const d10a = await state();
        await clickCanvas();
        const d10b = await state();
        await page.evaluate(() => window.__panels.set('build', false));
        await page.waitForTimeout(340);
        step('D10 构建台收起状态点画布后保持不变（44px 轨道不被意外展开）',
            d10a.panels.build && d10a.panels.buildWidth === 44
            && d10b.panels.build && d10b.panels.buildWidth === 44,
            { before: d10a.panels, after: d10b.panels });

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
