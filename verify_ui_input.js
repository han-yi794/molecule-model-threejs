// UI 双输入框冒烟验证 —— 针对 球棍模型4.html 的 #name-input / #smiles-input / #btn-molecule-from-input / window.__generateFromInput
// 运行方式（必须先起静态服务器，或脚本会自动拉起）:
//   python -m http.server 8000
//   cmd /c "node verify_ui_input.js > verify_ui_input.json 2>&1"
const { chromium } = require('playwright-core');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 8000;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1`;

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
    eq(got, want, label) { this.ok(got === want, `${label}（期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(got)}）`); }
}

(async () => {
    const t0 = Date.now();
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const report = { passed: 0, failed: 0, total: 0, results: [], consoleErrors: [], elapsedMs: 0 };

    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });

    const atomCount = () => page.evaluate(() => {
        try { return window.__diag && window.__diag.atomPositions ? window.__diag.atomPositions().length : -1; } catch (e) { return -1; }
    });
    const toastText = () => page.evaluate(() => {
        const t = document.getElementById('toast-message');
        return t ? t.textContent : '';
    });
    const waitFor = async (fn, timeoutMs, label) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const v = await fn();
            if (v) return v;
            await new Promise(r => setTimeout(r, 200));
        }
        return null;
    };

    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => typeof window.__generateFromInput === 'function' && typeof window.__generateFromSmiles === 'function', null, { timeout: 30000 });

        // ---------- 场景 1：三个 UI 元素存在 ----------
        {
            const ac = new AssertionCollector();
            const exists = await page.evaluate(() => ({
                name: !!document.getElementById('name-input'),
                smiles: !!document.getElementById('smiles-input'),
                btn: !!document.getElementById('btn-molecule-from-input'),
                btnVisible: (() => { const b = document.getElementById('btn-molecule-from-input'); if (!b) return false; const s = getComputedStyle(b); return s.display !== 'none' && s.visibility !== 'hidden' && b.offsetParent !== null; })(),
                fn: typeof window.__generateFromInput === 'function',
            }));
            ac.ok(exists.name, '#name-input 存在');
            ac.ok(exists.smiles, '#smiles-input 存在');
            ac.ok(exists.btn, '#btn-molecule-from-input 存在');
            ac.ok(exists.btnVisible, '#btn-molecule-from-input 可见（未被 CSS 隐藏）');
            ac.ok(exists.fn, 'window.__generateFromInput 已暴露');
            const pass = ac.failed === 0;
            report.total++; pass ? report.passed++ : report.failed++;
            report.results.push({ name: '1 UI 元素存在且可见', pass, detail: pass ? '通过' : ac.failures.join('；') });
        }

        // ---------- 场景 2：SMILES 'CCO' → 9 原子 + toast ----------
        {
            const ac = new AssertionCollector();
            await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(true));
            await page.fill('#smiles-input', 'CCO');
            await page.click('#btn-molecule-from-input');
            const n = await waitFor(async () => { const c = await atomCount(); return c === 9 ? c : null; }, 30000, 'CCO 原子数');
            ac.eq(n, 9, 'CCO 生成后原子数（期望 9）');
            const toast = await toastText();
            ac.ok(/已生成/.test(toast), 'toast 出现（实际: ' + toast + '）');
            const refilled = await page.evaluate(() => document.getElementById('smiles-input').value);
            ac.eq(refilled, 'CCO', 'SMILES 回填');
            const btnText = await page.evaluate(() => document.getElementById('btn-molecule-from-input').textContent);
            ac.eq(btnText, '从输入生成', '按钮文字恢复');
            const pass = ac.failed === 0;
            report.total++; pass ? report.passed++ : report.failed++;
            report.results.push({ name: '2 SMILES CCO 生成', pass, detail: pass ? '通过' : ac.failures.join('；') });
        }

        // ---------- 场景 3：名称 'ethanol' → 9 原子 + toast ----------
        {
            const ac = new AssertionCollector();
            await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(true));
            await page.fill('#smiles-input', '');
            await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(true));
            await page.fill('#name-input', 'ethanol');
            await page.click('#btn-molecule-from-input');
            const n = await waitFor(async () => { const c = await atomCount(); return c === 9 ? c : null; }, 30000, 'ethanol 原子数');
            ac.eq(n, 9, 'ethanol 生成后原子数（期望 9）');
            const toast = await toastText();
            ac.ok(/已从名称生成: ethanol/.test(toast), 'toast 含名称生成文案（实际: ' + toast + '）');
            const refilled = await page.evaluate(() => document.getElementById('smiles-input').value);
            ac.eq(refilled, 'CCO', 'SMILES 回填为 CCO');
            const pass = ac.failed === 0;
            report.total++; pass ? report.passed++ : report.failed++;
            report.results.push({ name: '3 名称 ethanol 生成', pass, detail: pass ? '通过' : ac.failures.join('；') });
        }

        // ---------- 场景 4：未知名称 → not_found toast + 按钮恢复 ----------
        {
            const ac = new AssertionCollector();
            await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(true));
            await page.fill('#smiles-input', '');
            await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(true));
            await page.fill('#name-input', '不存在的分子xyz123');
            await page.click('#btn-molecule-from-input');
            const toast = await waitFor(async () => {
                const t = await toastText();
                return /未找到该分子|网络错误/.test(t) ? t : null;
            }, 60000, '未知名称 toast');
            ac.ok(!!toast, '未知名称 toast 出现（实际: ' + (toast || '(无)') + '）');
            // 环境无网络或 Cactus 对未知名返回 5xx 时，正确行为是 network 文案；有网络时为 not_found 文案
            ac.ok(/未找到该分子|网络错误/.test(toast), 'toast 为 not_found 或 network 中文文案（实际: ' + (toast || '(无)') + '）');
            const btnText = await page.evaluate(() => document.getElementById('btn-molecule-from-input').textContent);
            ac.eq(btnText, '从输入生成', '按钮文字恢复');
            const btnOpacity = await page.evaluate(() => document.getElementById('btn-molecule-from-input').style.opacity);
            ac.eq(btnOpacity, '1', '按钮透明度恢复');
            const pass = ac.failed === 0;
            report.total++; pass ? report.passed++ : report.failed++;
            report.results.push({ name: '4 未知名称 not_found', pass, detail: pass ? '通过' : ac.failures.join('；') });
        }

        // ---------- 场景 5：SMILES 错误 'C(' → 解析失败 toast + 原子数不变 ----------
        {
            const ac = new AssertionCollector();
            const before = await atomCount();
            await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(true));
            await page.fill('#name-input', '');
            await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(true));
            await page.fill('#smiles-input', 'C(');
            await page.click('#btn-molecule-from-input');
            const toast = await waitFor(async () => {
                const t = await toastText();
                return /SMILES 语法错误/.test(t) ? t : null;
            }, 30000, 'SMILES 错误 toast');
            ac.ok(!!toast, 'SMILES 语法错误 toast 出现（实际: ' + (toast || '(无)') + '）');
            const after = await atomCount();
            ac.eq(after, before, '原子数不变（' + before + ' → ' + after + '）');
            const pass = ac.failed === 0;
            report.total++; pass ? report.passed++ : report.failed++;
            report.results.push({ name: '5 SMILES 错误 C(', pass, detail: pass ? '通过' : ac.failures.join('；') });
        }

        // ---------- 场景 6：两输入框都空 → 提示 toast ----------
        {
            const ac = new AssertionCollector();
            const before = await atomCount();
            await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(true));
            await page.fill('#name-input', '');
            await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(true));
            await page.fill('#smiles-input', '');
            await page.click('#btn-molecule-from-input');
            const toast = await waitFor(async () => {
                const t = await toastText();
                return /请输入分子名称或 SMILES/.test(t) ? t : null;
            }, 10000, '空输入 toast');
            ac.ok(!!toast, '空输入 toast 出现（实际: ' + (toast || '(无)') + '）');
            const after = await atomCount();
            ac.eq(after, before, '原子数不变');
            const pass = ac.failed === 0;
            report.total++; pass ? report.passed++ : report.failed++;
            report.results.push({ name: '6 空输入提示', pass, detail: pass ? '通过' : ac.failures.join('；') });
        }

        // ---------- 场景 7（附加）：Enter 键触发生成 ----------
        {
            const ac = new AssertionCollector();
            await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(true));
            await page.fill('#smiles-input', 'CC');
            await page.press('#smiles-input', 'Enter');
            const n = await waitFor(async () => { const c = await atomCount(); return c === 8 ? c : null; }, 30000, 'Enter 生成乙烷');
            ac.eq(n, 8, 'Enter 键生成 CC 后原子数（期望 8）');
            const pass = ac.failed === 0;
            report.total++; pass ? report.passed++ : report.failed++;
            report.results.push({ name: '7 Enter 键触发生成', pass, detail: pass ? '通过' : ac.failures.join('；') });
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