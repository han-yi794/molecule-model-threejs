// 端到端集成验证脚本 —— 针对 球棍模型4.html 的名称/SMILES → 分子生成全链路（用户视角）
// 覆盖：名称（英文/中文）生成、SMILES 生成（烷/芳香/复杂分子）、SMILES 语法错误、
//       未知名称、疑似 SMILES 引导、清空、生成后现有功能可用性（优化/补氢/旋转标志）。
// 运行方式（必须先起静态服务器，或脚本会自动拉起）:
//   python -m http.server 8000
//   cmd /c "node verify_integration.js > verify_integration.json 2>&1"
// 输出 JSON 报告到 stdout; 有用例失败时 process.exitCode = 1。
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

    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 200)); });

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
    const mk = (name) => { const ac = new AssertionCollector(); report.total++; return ac; };
    // 点击生成按钮并等待异步流程结束（按钮从"解析中…"恢复），避免 _inputBusy 竞态：
    // 3D 请求期间旧分子还在场景内，后一场景点击会被 _inputBusy 直接忽略（实测 30s 超时）
    const clickAndWait = async (timeoutMs) => {
        await page.click('#btn-molecule-from-input');
        await page.waitForFunction(() => {
            const b = document.getElementById('btn-molecule-from-input');
            return b && b.textContent !== '解析中…';
        }, null, { timeout: timeoutMs || 60000 });
    };
    const fin = (name, ac) => {
        const pass = ac.failed === 0;
        pass ? report.passed++ : report.failed++;
        report.results.push({ name, pass, detail: pass ? `通过 ${ac.passed} 个断言` : `失败 ${ac.failed} 个断言: ${ac.failures.join('；')}`, assertions: { passed: ac.passed, failed: ac.failed } });
    };

    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => typeof window.__generateFromInput === 'function' && typeof window.__generateFromSmiles === 'function', null, { timeout: 30000 });

        // ---------- 1. 名称 'ethanol' → 9 原子 ----------
        {
            const ac = mk('1 名称 ethanol 生成');
            await page.fill('#smiles-input', '');
            await page.fill('#name-input', 'ethanol');
            await clickAndWait(60000);
            const n = await waitFor(async () => { const c = await atomCount(); return c === 9 ? c : null; }, 30000, 'ethanol 原子数');
            ac.eq(n, 9, 'ethanol 生成后原子数（期望 9）');
            const toast = await toastText();
            ac.ok(/已从名称生成: ethanol/.test(toast), 'toast 含名称生成文案（实际: ' + toast + '）');
            const refilled = await page.evaluate(() => document.getElementById('smiles-input').value);
            ac.eq(refilled, 'CCO', 'SMILES 回填为 CCO');
            fin('1 名称 ethanol 生成', ac);
        }

        // ---------- 2. 中文名称 '乙醇' → 9 原子 ----------
        {
            const ac = mk('2 中文名称 乙醇 生成');
            await page.fill('#smiles-input', ''); // 场景 1 生成后 HTML 会把 SMILES 回填为 CCO，必须先清空走名称分支
            await page.fill('#name-input', '乙醇');
            await clickAndWait(60000);
            const n = await waitFor(async () => { const c = await atomCount(); return c === 9 ? c : null; }, 30000, '乙醇 原子数');
            ac.eq(n, 9, '乙醇 生成后原子数（期望 9）');
            const toast = await toastText();
            ac.ok(/已从名称生成: 乙醇/.test(toast), 'toast 含中文名称文案（实际: ' + toast + '）');
            fin('2 中文名称 乙醇 生成', ac);
        }

        // ---------- 3. SMILES 'CCO' → 9 原子 ----------
        {
            const ac = mk('3 SMILES CCO 生成');
            await page.fill('#name-input', '');
            await page.fill('#smiles-input', 'CCO');
            await clickAndWait(60000);
            const n = await waitFor(async () => { const c = await atomCount(); return c === 9 ? c : null; }, 30000, 'CCO 原子数');
            ac.eq(n, 9, 'CCO 生成后原子数（期望 9）');
            const toast = await toastText();
            ac.ok(/已生成/.test(toast), 'toast 出现（实际: ' + toast + '）');
            fin('3 SMILES CCO 生成', ac);
        }

        // ---------- 4. 苯 'c1ccccc1' → 12 原子 ----------
        {
            const ac = mk('4 苯 c1ccccc1 生成');
            await page.fill('#smiles-input', 'c1ccccc1');
            await clickAndWait(60000);
            const n = await waitFor(async () => { const c = await atomCount(); return c === 12 ? c : null; }, 30000, '苯 原子数');
            ac.eq(n, 12, '苯 生成后原子数（期望 12）');
            const bonds = await page.evaluate(() => window.__diag.bonds().map(b => b.type));
            const ar = bonds.filter(t => Math.abs(t - 1.5) < 0.01).length;
            ac.eq(ar, 6, '芳香 1.5 键数（期望 6，实际 ' + ar + '）');
            fin('4 苯 c1ccccc1 生成', ac);
        }

        // ---------- 5. 阿司匹林 'CC(=O)Oc1ccccc1C(=O)O' → 21 原子 ----------
        {
            const ac = mk('5 阿司匹林 SMILES 生成');
            await page.fill('#smiles-input', 'CC(=O)Oc1ccccc1C(=O)O');
            await clickAndWait(60000);
            const n = await waitFor(async () => { const c = await atomCount(); return c === 21 ? c : null; }, 30000, '阿司匹林 原子数');
            ac.eq(n, 21, '阿司匹林 生成后原子数（期望 21 = 13 重原子 + 8 H）');
            const heavy = await page.evaluate(() => window.__diag.atomPositions().filter(a => a.type !== 'H').length);
            ac.eq(heavy, 13, '重原子数（期望 13）');
            const refilled = await page.evaluate(() => document.getElementById('smiles-input').value);
            ac.eq(refilled, 'CC(=O)Oc1ccccc1C(=O)O', 'SMILES 回填保持');
            fin('5 阿司匹林 SMILES 生成', ac);
        }

        // ---------- 6. SMILES 错误 'CC(' → 语法错误 toast + 原子数不变 ----------
        {
            const ac = mk('6 SMILES 语法错误 CC(');
            const before = await atomCount();
            await page.fill('#smiles-input', 'CC(');
            await clickAndWait(60000);
            const toast = await waitFor(async () => {
                const t = await toastText();
                return /SMILES 语法错误/.test(t) ? t : null;
            }, 30000, 'SMILES 语法错误 toast');
            ac.ok(!!toast, 'toast 出现（实际: ' + (toast || '(无)') + '）');
            ac.ok(/位置/.test(toast), 'toast 含错误位置（实际: ' + (toast || '(无)') + '）');
            const after = await atomCount();
            ac.eq(after, before, '原子数不变（' + before + ' → ' + after + '）');
            fin('6 SMILES 语法错误 CC(', ac);
        }

        // ---------- 7. 未知名称 'XQZWZZ99' → not_found toast + 原子数不变 ----------
        {
            const ac = mk('7 未知名称 not_found');
            const before = await atomCount();
            await page.fill('#smiles-input', '');
            await page.fill('#name-input', 'XQZWZZ99');
            await clickAndWait(60000);
            const toast = await waitFor(async () => {
                const t = await toastText();
                return /未找到该分子|网络错误/.test(t) ? t : null;
            }, 60000, '未知名称 toast');
            ac.ok(!!toast, 'toast 出现（实际: ' + (toast || '(无)') + '）');
            ac.ok(/未找到该分子|网络错误/.test(toast), 'toast 为 not_found 或 network 文案（实际: ' + (toast || '(无)') + '）');
            const after = await atomCount();
            ac.eq(after, before, '原子数不变（' + before + ' → ' + after + '）');
            fin('7 未知名称 not_found', ac);
        }

        // ---------- 8. 疑似 SMILES 名称 'zzzqqq999' → 引导到 SMILES 框 ----------
        {
            const ac = mk('8 疑似 SMILES 引导');
            const before = await atomCount();
            await page.fill('#name-input', 'zzzqqq999');
            await clickAndWait(60000);
            const toast = await waitFor(async () => {
                const t = await toastText();
                return /看起来像 SMILES/.test(t) ? t : null;
            }, 10000, 'looks_smiles toast');
            ac.ok(!!toast, 'toast 出现（实际: ' + (toast || '(无)') + '）');
            const after = await atomCount();
            ac.eq(after, before, '原子数不变');
            fin('8 疑似 SMILES 引导', ac);
        }

        // ---------- 9. 清空按钮 → 原子数 0 ----------
        {
            const ac = mk('9 清空按钮');
            await page.click('#btn-clear-molecule');
            // 注意：waitFor 用 `if (v) return v` 判真，返回值 0 是 falsy 会被当作未命中 → 必须返回 truthy 哨兵
            const cleared = await waitFor(async () => { const c = await atomCount(); return c === 0 ? true : null; }, 10000, '清空后原子数');
            ac.eq(cleared, true, '清空后原子数（期望 0，实际 ' + (await atomCount()) + '）');
            fin('9 清空按钮', ac);
        }

        // ---------- 10. 生成后现有功能可用（diag 可取数 + 一键优化按钮可跑 + 交互接口在） ----------
        {
            const ac = mk('10 生成后现有功能可用');
            await page.fill('#smiles-input', 'CCO');
            await clickAndWait(60000);
            const n = await waitFor(async () => { const c = await atomCount(); return c === 9 ? c : null; }, 30000, 'CCO 原子数');
            ac.eq(n, 9, '重新生成 CCO 成功');
            const state = await page.evaluate(() => ({
                atomsCount: (window.__diag && window.__diag.atomPositions ? window.__diag.atomPositions().length : -1),
                hasOptimizeBtn: !!document.getElementById('btn-optimize-all'),
                hasHydrogenate: typeof window.__hydrogenateAuto === 'function',
                hasTorsion: !!window.__torsion,
                hasCisTrans: !!window.__cisTrans,
                hasRunAll: typeof window.runAllExamplesAndTests === 'function',
            }));
            ac.eq(state.atomsCount, 9, '__diag.atomPositions 可取数（实际 ' + state.atomsCount + '）');
            ac.ok(state.hasOptimizeBtn, '一键优化按钮 #btn-optimize-all 存在');
            ac.ok(state.hasHydrogenate, '__hydrogenateAuto 补氢接口可用');
            ac.ok(state.hasTorsion, '__torsion 单键旋转接口可用');
            ac.ok(state.hasCisTrans, '__cisTrans 顺反翻转接口可用');
            ac.ok(state.hasRunAll, 'runAllExamplesAndTests 自测入口可用');
            const optOk = await page.evaluate(async () => {
                try { window.__hydrogenateAuto(true); return true; } catch (e) { return 'ERR: ' + String(e); }
            });
            ac.eq(optOk, true, '__hydrogenateAuto(true) 调用无异常');
            fin('10 生成后现有功能可用', ac);
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