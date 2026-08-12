// 名称解析双路径验证脚本 —— 针对 球棍模型4.html 的 window.__resolveName / __resolveNameOnline / __resolveNameToSmiles
// 运行方式（必须先起静态服务器，或脚本会自动拉起）:
//   python -m http.server 8000
//   cmd /c "node verify_name_resolve.js > verify_name_resolve.json 2>&1"
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
    const report = { passed: 0, failed: 0, total: 0, results: [], consoleErrors: [], elapsedMs: 0, online: {} };

    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 200)); });

    const run = (name, check) => {
        const ac = new AssertionCollector();
        try { check(ac); }
        catch (e) { ac.ok(false, '断言执行抛异常: ' + String(e).slice(0, 200)); }
        const pass = ac.failed === 0;
        report.total++;
        pass ? report.passed++ : report.failed++;
        report.results.push({
            name, pass,
            detail: pass ? `通过 ${ac.passed} 个断言` : `失败 ${ac.failed} 个断言: ${ac.failures.join('；')}`,
            assertions: { passed: ac.passed, failed: ac.failed },
        });
    };

    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => typeof window.__resolveNameToSmiles === 'function', null, { timeout: 30000 });

        // ---- 1. 内置库 resolveName 命中（≥5 个含中文） ----
        const localHits = await page.evaluate(() => {
            const names = ['ethanol', '乙醇', 'aspirin', '阿司匹林', '乙酸乙酯', 'EthylAcetate', 'ethyl acetate', '反-2-丁烯', 'trans-2-butene', '苯甲酸', 'glucose', '葡萄糖', 'cyclopropane', '环丙烷', 'methane', '甲烷'];
            const out = {};
            for (const n of names) out[n] = window.__resolveName(n);
            return out;
        });
        run('内置库 resolveName 命中（16 名）', (a) => {
            a.eq(localHits['ethanol'], 'CCO', 'ethanol');
            a.eq(localHits['乙醇'], 'CCO', '乙醇');
            a.eq(localHits['aspirin'], 'CC(=O)Oc1ccccc1C(=O)O', 'aspirin');
            a.eq(localHits['阿司匹林'], 'CC(=O)Oc1ccccc1C(=O)O', '阿司匹林');
            a.eq(localHits['乙酸乙酯'], 'CCOC(=O)C', '乙酸乙酯');
            a.eq(localHits['EthylAcetate'], 'CCOC(=O)C', 'EthylAcetate（大小写归一）');
            a.eq(localHits['ethyl acetate'], 'CCOC(=O)C', 'ethyl acetate（空格归一）');
            a.eq(localHits['反-2-丁烯'], 'C/C=C/C', '反-2-丁烯');
            a.eq(localHits['trans-2-butene'], 'C/C=C/C', 'trans-2-butene');
            a.eq(localHits['苯甲酸'], 'OC(=O)c1ccccc1', '苯甲酸');
            a.eq(localHits['glucose'], 'OC1C(O)C(O)C(O)C(O)C1O', 'glucose');
            a.eq(localHits['葡萄糖'], 'OC1C(O)C(O)C(O)C(O)C1O', '葡萄糖');
            a.eq(localHits['cyclopropane'], 'C1CC1', 'cyclopropane');
            a.eq(localHits['环丙烷'], 'C1CC1', '环丙烷');
            a.eq(localHits['methane'], 'C', 'methane');
            a.eq(localHits['甲烷'], 'C', '甲烷');
        });

        // ---- 2. NAME_LIBRARY 条数 ----
        const libCount = await page.evaluate(() => Object.keys(window.__NAME_LIBRARY).length);
        run('NAME_LIBRARY 条数 ≥ 30', (a) => { a.ok(libCount >= 30, `条数 ${libCount}（期望 ≥30）`); });

        // ---- 3. resolveNameToSmiles 统一入口（本地命中 + 未命中） ----
        const unified = await page.evaluate(async () => {
            const out = {};
            out['ethanol'] = await window.__resolveNameToSmiles('ethanol');
            out['乙醇'] = await window.__resolveNameToSmiles('乙醇');
            out['aspirin'] = await window.__resolveNameToSmiles('aspirin');
            out['missing'] = await window.__resolveNameToSmiles('不存在的分子xyz');
            return out;
        });
        run('resolveNameToSmiles 统一入口', (a) => {
            a.eq(unified['ethanol'].smiles, 'CCO', 'ethanol → CCO');
            a.eq(unified['乙醇'].smiles, 'CCO', '乙醇 → CCO');
            a.eq(unified['aspirin'].smiles, 'CC(=O)Oc1ccccc1C(=O)O', 'aspirin → 阿司匹林 SMILES');
            a.ok(!!unified['missing'].error, '不存在的分子xyz → {error}');
        });

        // ---- 4. 在线解析（网络可达性自适应） ----
        const online = await page.evaluate(async () => {
            const out = {};
            const t1 = Date.now();
            out['water'] = await window.__resolveNameOnline('water');
            out['waterMs'] = Date.now() - t1;
            const t2 = Date.now();
            out['methane'] = await window.__resolveNameOnline('methane');
            out['methaneMs'] = Date.now() - t2;
            const t3 = Date.now();
            out['missing'] = await window.__resolveNameOnline('zzzqqqnotacompound999');
            out['missingMs'] = Date.now() - t3;
            return out;
        });
        report.online = online;
        run('resolveNameOnline water', (a) => {
            if (online['water'].smiles) a.eq(online['water'].smiles, 'O', 'water → O');
            else if (online['water'].error === 'ambiguous') a.ok(online['water'].candidates && online['water'].candidates.length > 0, 'water 歧义 → 候选列表非空');
            else a.eq(online['water'].error, 'network', '网络不可达 → {error:network} 且不抛异常');
        });
        run('resolveNameOnline methane', (a) => {
            if (online['methane'].smiles) a.ok(online['methane'].smiles === 'C' || online['methane'].smiles.includes('C'), `methane → ${online['methane'].smiles}`);
            else if (online['methane'].error === 'ambiguous') a.ok(online['methane'].candidates && online['methane'].candidates.length > 0, 'methane 歧义 → 候选列表非空');
            else a.eq(online['methane'].error, 'network', '网络不可达 → {error:network}');
        });
        run('resolveNameOnline 未知名', (a) => {
            a.ok(online['missing'].error === 'not_found' || online['missing'].error === 'network', `未知名 → ${JSON.stringify(online['missing'])}`);
        });
        run('在线请求 ≤ 12s', (a) => {
            a.ok(online['waterMs'] <= 12000, `water ${online['waterMs']}ms`);
            a.ok(online['methaneMs'] <= 12000, `methane ${online['methaneMs']}ms`);
            a.ok(online['missingMs'] <= 12000, `missing ${online['missingMs']}ms`);
        });

        // ---- 5. resolveNameToSmiles 在线兜底（water 不在内置库，应走在线） ----
        const unifiedOnline = await page.evaluate(async () => {
            const t = Date.now();
            const r = await window.__resolveNameToSmiles('water');
            return { r, ms: Date.now() - t };
        });
        report.unifiedOnline = unifiedOnline;
        run('resolveNameToSmiles water 在线兜底', (a) => {
            if (unifiedOnline.r.smiles) a.eq(unifiedOnline.r.smiles, 'O', 'water → O（在线兜底）');
            else if (unifiedOnline.r.error === 'ambiguous') a.ok(unifiedOnline.r.candidates && unifiedOnline.r.candidates.length > 0, 'water 歧义 → 候选列表非空');
            else a.eq(unifiedOnline.r.error, 'network', '网络不可达 → {error:network}');
        });

        // ---- 6. 歧义候选路径（防御性：直接构造多候选调用面板；resolveNameCandidates 结构断言） ----
        const candFn = await page.evaluate(async () => {
            return {
                hasFn: typeof window.__resolveNameCandidates === 'function',
                hasPanelFn: typeof window.__showAmbiguousCandidates === 'function',
                hasPrecheck: typeof window.__precheckNameInput === 'function',
                precheckSmiles: window.__precheckNameInput('c1ccccc1'),
                precheckName: window.__precheckNameInput('乙醇'),
                precheckJunk: window.__precheckNameInput('12345'),
            };
        });
        run('歧义候选/预检调试接口', (a) => {
            a.ok(candFn.hasFn, '__resolveNameCandidates 已暴露');
            a.ok(candFn.hasPanelFn, '__showAmbiguousCandidates 已暴露');
            a.ok(candFn.hasPrecheck, '__precheckNameInput 已暴露');
            a.eq(candFn.precheckSmiles && candFn.precheckSmiles.kind, 'looks_smiles', 'c1ccccc1 → looks_smiles');
            a.eq(candFn.precheckName, null, '乙醇 → 不拦截');
            a.eq(candFn.precheckJunk && candFn.precheckJunk.kind, 'not_found', '12345 → not_found');
        });
        const panelTest = await page.evaluate(async () => {
            const panel = document.getElementById('candidate-panel');
            const before = getComputedStyle(panel).display;
            window.__showAmbiguousCandidates([{ smiles: 'CCO', cid: 1 }, { smiles: 'CO', cid: 2 }], 'testmol');
            const afterOpen = getComputedStyle(panel).display;
            const items = document.querySelectorAll('#candidate-panel-list .cand-item').length;
            const title = document.getElementById('candidate-panel-title').textContent;
            window.__hideCandidatePanel();
            const afterClose = getComputedStyle(panel).display;
            return { before, afterOpen, items, title, afterClose };
        });
        run('歧义候选面板展示/关闭', (a) => {
            a.eq(panelTest.before, 'none', '初始隐藏');
            a.eq(panelTest.afterOpen, 'block', '展示候选面板');
            a.eq(panelTest.items, 2, '渲染 2 个候选条目');
            a.ok(panelTest.title.indexOf('2 个候选') >= 0, '标题含候选数（实际: ' + panelTest.title + '）');
            a.eq(panelTest.afterClose, 'none', '关闭后隐藏');
        });
        const candClick = await page.evaluate(async () => {
            window.__showAmbiguousCandidates([{ smiles: 'CC', cid: 1 }], 'candtest');
            document.querySelector('#candidate-panel-list .cand-item').click();
            await new Promise(r => setTimeout(r, 4000));
            const panelGone = document.getElementById('candidate-panel').style.display === 'none';
            const atomN = window.__diag.atomPositions().length;
            const refilled = document.getElementById('smiles-input').value;
            return { panelGone, atomN, refilled };
        });
        run('歧义候选点击生成', (a) => {
            a.eq(candClick.panelGone, true, '点击候选后面板关闭');
            a.eq(candClick.atomN, 8, '点击候选 CC 生成 8 原子（含 H）');
            a.eq(candClick.refilled, 'CC', 'SMILES 输入框回填 CC');
        });
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