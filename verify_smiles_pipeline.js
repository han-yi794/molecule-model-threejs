// SMILES 生成管线验证脚本 —— 针对 球棍模型4.html 的 window.__smilesToSpec / window.__generateFromSmiles
// 运行方式（必须先起静态服务器，或脚本会自动拉起）:
//   python -m http.server 8000
//   cmd /c "node verify_smiles_pipeline.js > verify_smiles_pipeline.json 2>&1"
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
    near(got, want, tol, label) { this.ok(Math.abs(got - want) <= tol, `${label}（期望 ${want}±${tol}，实际 ${got}）`); }
}

(async () => {
    const t0 = Date.now();
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const report = { passed: 0, failed: 0, total: 0, results: [], consoleErrors: [], elapsedMs: 0 };

    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 200)); });

    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => typeof window.__generateFromSmiles === 'function', null, { timeout: 30000 });

        const SMOKE = ['CCO', 'c1ccccc1', 'CC(=O)O', 'C1CC1', 'C('];

        const results = await page.evaluate(async (smilesList) => {
            const out = [];
            for (const sm of smilesList) {
                try {
                    const r = await window.__generateFromSmiles(sm);
                    if (!r.ok) { out.push({ smiles: sm, ok: false, error: r.error }); continue; }
                    // 原子/键快照（复用已暴露的 __diag 接口）
                    const snapshot = window.__diag.atomPositions();
                    const bondList = window.__diag.bonds().map(b => ({ a: b.pair[0], b: b.pair[1], type: b.type, len: b.len }));
                    out.push({ smiles: sm, ok: true, spec: r.spec, atomCount: r.atomCount, snapshot, bondList });
                } catch (e) {
                    out.push({ smiles: sm, ok: false, error: { pos: -1, msg: '抛异常: ' + String(e) } });
                }
            }
            return out;
        }, SMOKE);

        // 工具函数：按元素类型计数
        const countType = (snap, t) => snap.filter(a => a.type === t).length;
        // 快照 → id 索引映射
        const byId = (snap) => { const m = {}; for (const a of snap) m[a.id] = a; return m; };
        // 键查找：两端原子类型匹配
        const findBond = (bondList, snap, tA, tB) => {
            const m = byId(snap);
            for (const b of bondList) {
                const ta = m[b.a].type, tb = m[b.b].type;
                if ((ta === tA && tb === tB) || (ta === tB && tb === tA)) return b;
            }
            return null;
        };
        // 环键集合：两端均为环骨架原子（类型相同且非 H）
        const ringBonds = (bondList, snap, t) => {
            const m = byId(snap);
            return bondList.filter(b => m[b.a].type === t && m[b.b].type === t);
        };

        const mk = (name) => { const ac = new AssertionCollector(); report.total++; return ac; };
        const fin = (name, ac, detail) => {
            const pass = ac.failed === 0;
            pass ? report.passed++ : report.failed++;
            report.results.push({ name, pass, detail: detail || (pass ? `通过 ${ac.passed} 个断言` : `失败 ${ac.failed} 个断言: ${ac.failures.join('；')}`), assertions: { passed: ac.passed, failed: ac.failed } });
        };

        // ---- 01 乙醇 CCO ----
        {
            const ac = mk('01 乙醇 CCO');
            const r = results[0];
            ac.ok(r.ok, '生成应成功');
            if (r.ok) {
                ac.eq(r.atomCount, 9, '补氢后总原子数（3 重原子 + 6 H）');
                ac.eq(countType(r.snapshot, 'C'), 2, 'C 数 2');
                ac.eq(countType(r.snapshot, 'O'), 1, 'O 数 1');
                ac.eq(countType(r.snapshot, 'H'), 6, 'H 数 6');
                const cc = findBond(r.bondList, r.snapshot, 'C', 'C');
                ac.ok(!!cc, '存在 C-C 键');
                if (cc) ac.near(cc.len, 1.54, 0.03, 'C-C 键长');
                const co = findBond(r.bondList, r.snapshot, 'C', 'O');
                ac.ok(!!co, '存在 C-O 键');
                if (co) ac.near(co.len, 1.43, 0.03, 'C-O 键长');
            }
            fin('01 乙醇 CCO', ac);
        }

        // ---- 02 苯 c1ccccc1 ----
        {
            const ac = mk('02 苯 c1ccccc1');
            const r = results[1];
            ac.ok(r.ok, '生成应成功');
            if (r.ok) {
                ac.eq(r.atomCount, 12, '总原子数（6C + 6H）');
                ac.eq(countType(r.snapshot, 'C'), 6, 'C 数 6');
                ac.eq(countType(r.snapshot, 'H'), 6, 'H 数 6');
                const cc = ringBonds(r.bondList, r.snapshot, 'C');
                ac.eq(cc.length, 6, '环 C-C 键数 6');
                const lens = cc.map(b => b.len);
                ac.ok(lens.every(l => Math.abs(l - 1.40) <= 0.05), '环键长均 ≈1.40（±0.05）: ' + lens.join(','));
                // 正六边形：相邻键长最大偏差
                if (cc.length === 6) {
                    const spread = Math.max(...lens) - Math.min(...lens);
                    ac.ok(spread <= 0.05, `环键长均匀（max-min=${spread.toFixed(3)} ≤ 0.05）`);
                    // 环上每个 C 有 2 个环邻居 → C-C-C 角 ≈ 120°（平面正六边形内角）
                    const m = byId(r.snapshot);
                    const cAtoms = r.snapshot.filter(a => a.type === 'C');
                    const ccPairs = cc.map(b => [b.a, b.b]);
                    const angles = [];
                    for (const ca of cAtoms) {
                        const nbs = [];
                        for (const p of ccPairs) {
                            if (p[0] === ca.id) nbs.push(m[p[1]]);
                            if (p[1] === ca.id) nbs.push(m[p[0]]);
                        }
                        if (nbs.length === 2) {
                            const p1 = nbs[0], pc = ca, p2 = nbs[1];
                            const v1 = [p1.x - pc.x, p1.y - pc.y, p1.z - pc.z];
                            const v2 = [p2.x - pc.x, p2.y - pc.y, p2.z - pc.z];
                            const dot = (v1[0]*v2[0] + v1[1]*v2[1] + v1[2]*v2[2]) / (Math.hypot(...v1) * Math.hypot(...v2));
                            angles.push(Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI);
                        }
                    }
                    ac.eq(angles.length, 6, '6 个环内角可测');
                    if (angles.length === 6) {
                        const avg = angles.reduce((s, v) => s + v, 0) / 6;
                        ac.near(avg, 120, 8, `环内角均值 ≈120°（实际 ${avg.toFixed(1)}°）`);
                    }
                }
            }
            fin('02 苯 c1ccccc1', ac);
        }

        // ---- 03 乙酸 CC(=O)O ----
        {
            const ac = mk('03 乙酸 CC(=O)O');
            const r = results[2];
            ac.ok(r.ok, '生成应成功');
            if (r.ok) {
                ac.eq(r.atomCount, 8, '总原子数（4 重原子 + 4 H）');
                ac.eq(countType(r.snapshot, 'C'), 2, 'C 数 2');
                ac.eq(countType(r.snapshot, 'O'), 2, 'O 数 2');
                const m03 = byId(r.snapshot);
                const co = ringBonds(r.bondList, r.snapshot, 'C').filter(b => m03[b.b].type === 'O' || m03[b.a].type === 'O');
                const carb = r.bondList.filter(b => b.type === 2);
                ac.eq(carb.length, 1, '存在 1 条双键（C=O）');
                if (carb.length === 1) ac.near(carb[0].len, 1.244, 0.05, 'C=O 键长');
            }
            fin('03 乙酸 CC(=O)O', ac);
        }

        // ---- 04 环丙烷 C1CC1 ----
        {
            const ac = mk('04 环丙烷 C1CC1');
            const r = results[3];
            ac.ok(r.ok, '生成应成功');
            if (r.ok) {
                ac.eq(r.atomCount, 9, '总原子数（3C + 6H）');
                ac.eq(countType(r.snapshot, 'C'), 3, 'C 数 3');
                ac.eq(countType(r.snapshot, 'H'), 6, 'H 数 6');
                const cc = ringBonds(r.bondList, r.snapshot, 'C');
                ac.eq(cc.length, 3, '环 C-C 键数 3');
                if (cc.length === 3) {
                    const lens = cc.map(b => b.len);
                    ac.ok(lens.every(l => Math.abs(l - 1.54) <= 0.08), '环键长均 ≈1.54（±0.08）: ' + lens.join(','));
                }
            }
            fin('04 环丙烷 C1CC1', ac);
        }

        // ---- 05 非法 C( ----
        {
            const ac = mk('05 非法 C(');
            const r = results[4];
            ac.eq(r.ok, false, '应返回 ok:false');
            ac.ok(!!r.error, '应携带 error');
            if (r.error) {
                ac.ok(typeof r.error.pos === 'number' && isFinite(r.error.pos), `error.pos 应为数字（实际 ${JSON.stringify(r.error.pos)}）`);
                ac.ok(typeof r.error.msg === 'string' && r.error.msg.length > 0, `error.msg 应为非空字符串（实际 ${JSON.stringify(r.error.msg)}）`);
            }
            fin('05 非法 C(', ac);
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
