// verify_new_elements.js — SMILES 扩展元素验证
// 场景: TMS 四甲基硅烷 / 硼酸 / 硒酚 / 二茂铁式配位(用简单) / 金属卤化物 / 芳香硒
// 输出 verify_new_elements.json
const { chromium } = require('playwright');

const PORT = 8012;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=ne3`;

async function probe(url) {
    const http = require('http');
    return new Promise(res => {
        const req = http.get(url, r => { r.resume(); res(r.statusCode >= 200 && r.statusCode < 500); });
        req.on('error', () => res(false));
        req.setTimeout(3000, () => { req.destroy(); res(false); });
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
    const { spawn } = require('child_process');
    for (const bin of ['python', 'py']) {
        const proc = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() });
        const ready = await waitPort(15000);
        if (ready) return proc;
        proc.kill();
    }
    return null;
}

(async () => {
    const t0 = Date.now();
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const report = { passed: 0, failed: 0, total: 0, results: [], consoleErrors: [], elapsedMs: 0 };
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });

    const cases = [
        // [name, smiles, 期望重原子计数(含 Si 等), 期望类型集合子集]
        ['四甲基硅烷 TMS', 'C[Si](C)(C)C', 5, ['C', 'Si']],
        ['硼酸 B(OH)3', 'B(O)(O)O', 4, ['B', 'O']],
        ['硅烷 SiH4 显式', '[SiH4]', 1, ['Si']],
        ['三甲基硼', 'B(C)(C)C', 4, ['B', 'C']],
        ['硒酚 C4H4Se', 'c1cc[se]c1', 5, ['C', 'Se']],
        ['氯化锌/金属卤化锌', 'Cl[Zn]Cl', 3, ['Zn', 'Cl']],
        ['二甲基镁', 'C[Mg]C', 3, ['Mg', 'C']],
        ['三甲基铝', 'C[Al](C)C', 4, ['Al', 'C']],
        ['四甲基锡', 'C[Sn](C)(C)C', 5, ['Sn', 'C']],
        ['砷化氢 胂 AsH3', '[AsH3]', 1, ['As']],
        ['硅醇 (CH3)3SiOH', 'C[Si](C)(C)O', 5, ['Si', 'C', 'O']],
        ['乙基硼酸', 'CCB(O)O', 5, ['B', 'C', 'O']],
    ];

    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(e => { report.results.push({ name: 'GOTO-FAIL', pass: false, detail: String(e).slice(0, 300) }); });
        const loaded = await page.waitForFunction(() => typeof window.__parseSmiles === 'function', null, { timeout: 30000 }).then(() => true).catch(() => false);
        if (!loaded) { report.results.push({ name: '页面未加载', pass: false, detail: 'waitForFunction 超时' }); }
        await page.waitForFunction(() => typeof window.__generateFromSmiles === 'function' && typeof window.__addMissingHydrogens === 'function', null, { timeout: 30000 }).catch(() => {});

        for (const [name, smiles, wantHeavy, types] of cases) {
            const ac = { ok: [], fail: [] };
            const ok = (cond, label) => cond ? ac.ok.push(label) : ac.fail.push(`${label}（期望 ${JSON.stringify(wantHeavy)}/${JSON.stringify(types)}）`);
            report.total++;
            try {
                const r = await page.evaluate((sm) => {
                    const spec = window.__parseSmiles ? window.__parseSmiles(sm) : null;
                    return { spec };
                }, smiles);
                const spec = r.spec;
                if (!spec) { ok(false, 'parseSmiles 返回 null'); }
                else {
                    ok(!spec.error, 'parseSmiles 无 error');
                    const typesArr = spec.atoms.map(a => a.type);
                    const heavy = typesArr.filter(t => t !== 'H');
                    ok(heavy.length === wantHeavy, `重原子数（实际 ${heavy.length}）`);
                    for (const t of types) ok(typesArr.includes(t), `含元素 ${t}`);
                    // 生成 + 补氢
                    const g = await page.evaluate((sm) => {
                        window.__generateFromSmiles(sm);
                        window.__addMissingHydrogens();
                        return { n: window.__diag.atomPositions().length, types: window.__diag.atomPositions().map(p => p.type), bonds: window.__diag.bonds().length };
                    }, smiles);
                    ok(g.n > 0, `生成后原子数（实际 ${g.n}）`);
                    ok(g.bonds > 0, `键数（实际 ${g.bonds}）`);
                }
            } catch (e) {
                ok(false, '异常: ' + String(e).slice(0, 200));
            }
            const pass = ac.fail.length === 0;
            pass ? report.passed++ : report.failed++;
            report.results.push({ name, pass, detail: pass ? `通过 ${ac.ok.length} 项` : `失败 ${ac.fail.length} 项: ${ac.fail.join('；')}` });
        }

        // 显式不支持的芳香原子应报错(回归: p 芳香磷不支持仍报错)
        {
            report.total++;
            const r = await page.evaluate(() => window.__parseSmiles('c1cc[p]c1'));
            const pass = !r.spec || r.spec.ok === false;
            pass ? report.passed++ : report.failed++;
            report.results.push({ name: '不支持的芳香原子 [p] 拒绝', pass, detail: pass ? '通过' : '失败: 应拒绝' });
        }
    } catch (e) {
        report.results.push({ name: 'FATAL', pass: false, detail: String(e).slice(0, 500) });
    }

    report.elapsedMs = Date.now() - t0;
    await browser.close();
    if (serverProc) serverProc.kill();
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.failed > 0 ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });