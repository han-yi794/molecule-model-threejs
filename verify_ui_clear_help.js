// verify_ui_clear_help.js — × 清空按钮 + SMILES 帮助折叠 验证
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8030;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=uiclr`;
async function probe(url) { return new Promise(res => { const req = http.get(url, r => { r.resume(); res(true); }); req.on('error', () => res(false)); req.setTimeout(3000, () => { req.destroy(); res(false); }); }); }
async function waitPort(ms) { const dl = Date.now() + ms; while (Date.now() < dl) { if (await probe(`http://127.0.0.1:${PORT}/`)) return true; await new Promise(r => setTimeout(r, 500)); } return false; }
async function ensureServer() { if (await waitPort(1000)) return null; const { spawn } = require('child_process'); for (const bin of ['python', 'py']) { const p = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() }); if (await waitPort(15000)) return p; p.kill(); } return null; }
(async () => {
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const report = { results: [], consoleErrors: [] };
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => typeof window.__syncInputClearButtons === 'function', null, { timeout: 30000 });
        const out = { steps: [] };
        const step = (name, ok, detail) => out.steps.push({ name, ok: !!ok, detail });

        // 1. 初始状态：两个输入框为空，× 隐藏
        let visName = await page.evaluate(() => { const b = document.querySelector('.clear-btn[data-clear="name-input"]'); return b ? b.style.display : 'missing'; });
        let visSmiles = await page.evaluate(() => { const b = document.querySelector('.clear-btn[data-clear="smiles-input"]'); return b ? b.style.display : 'missing'; });
        step('初始空输入框 × 隐藏', visName === 'none' && visSmiles === 'none', { visName, visSmiles });

        // 2. 输入内容后 × 显示
        await page.fill('#smiles-input', 'CCO');
        visSmiles = await page.evaluate(() => document.querySelector('.clear-btn[data-clear="smiles-input"]').style.display);
        step('输入后 × 显示', visSmiles === 'block', { visSmiles });

        // 3. 点击 × 清空并聚焦
        await page.click('.clear-btn[data-clear="smiles-input"]');
        const val = await page.evaluate(() => document.getElementById('smiles-input').value);
        const focused = await page.evaluate(() => document.activeElement === document.getElementById('smiles-input'));
        visSmiles = await page.evaluate(() => document.querySelector('.clear-btn[data-clear="smiles-input"]').style.display);
        step('点击 × 清空内容并聚焦', val === '' && focused && visSmiles === 'none', { val, focused, visSmiles });

        // 4. 生成后回填同步：名称生成回填 SMILES → × 应显示
        await page.fill('#name-input', '乙醇');
        await page.click('#btn-molecule-from-input');
        await page.waitForFunction(() => document.getElementById('smiles-input').value === 'CCO', null, { timeout: 30000 });
        visSmiles = await page.evaluate(() => document.querySelector('.clear-btn[data-clear="smiles-input"]').style.display);
        step('名称生成回填后 × 同步显示', visSmiles === 'block', { visSmiles, refilled: await page.evaluate(() => document.getElementById('smiles-input').value) });

        // 5. name-input 的 × 也工作
        await page.fill('#name-input', 'abc');
        visName = await page.evaluate(() => document.querySelector('.clear-btn[data-clear="name-input"]').style.display);
        await page.click('.clear-btn[data-clear="name-input"]');
        const nameVal = await page.evaluate(() => document.getElementById('name-input').value);
        step('name-input × 显示与清空', visName === 'block' && nameVal === '', { visName, nameVal });

        // 6. 帮助折叠：初始收起 → 点击展开 → 再点收起
        const h0 = await page.evaluate(() => document.getElementById('smiles-help').classList.contains('open'));
        await page.click('#smiles-help-toggle');
        const h1 = await page.evaluate(() => document.getElementById('smiles-help').classList.contains('open'));
        const t1 = await page.evaluate(() => document.getElementById('smiles-help-toggle').textContent);
        await page.click('#smiles-help-toggle');
        const h2 = await page.evaluate(() => document.getElementById('smiles-help').classList.contains('open'));
        step('帮助折叠开/关', h0 === false && h1 === true && h2 === false, { h0, h1, h2, t1: t1.slice(0, 20) });

        // 7. 帮助内容包含关键语法项
        const html = await page.evaluate(() => document.getElementById('smiles-help').innerHTML);
        step('帮助含双键/环/电荷/例子', ['C=C', 'c1ccccc1', '[N+]', '阿司匹林', '鞘磷脂'].every(k => html.includes(k)), {});

        // 8. × 不触发生成
        await page.fill('#smiles-input', 'CC');
        await page.click('.clear-btn[data-clear="smiles-input"]');
        const stillEmpty = await page.evaluate(() => document.getElementById('smiles-input').value === '');
        step('点击 × 后输入框为空(未误触生成)', stillEmpty, { stillEmpty });

        report.results.push({ name: 'ui-clear-help', data: out });
    } catch (e) { report.results.push({ name: 'FATAL', data: String(e).slice(0, 400) }); }
    await browser.close();
    if (serverProc) serverProc.kill();
    console.log(JSON.stringify(report, null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });