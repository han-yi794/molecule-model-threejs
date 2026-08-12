// SMILES 名称→分子几何质量验证脚本 —— 针对 球棍模型4.html 的 window.__generateFromSmiles 管线
// 覆盖 14 个代表性分子（键长/键角几何断言）+ 3 条错误路径，总断言 ≥ 35。
// 运行方式（必须先起静态服务器，或脚本会自动拉起）:
//   python -m http.server 8000
//   cmd /c "node verify_name2mol.js > verify_name2mol.json 2>&1"
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
    if (await waitPort(1000)) return null; // 已有服务器
    for (const bin of ['python', 'py']) {
        const proc = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() });
        const ready = await waitPort(15000);
        if (ready) return proc;
        proc.kill();
    }
    return null; // 起不来也不抛，让 page.goto 自然失败并报 FATAL
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

        const SMILES_LIST = [
            'CCO', 'CC(=O)O', 'C1CC1', 'c1ccccc1', 'C#N', 'C1=CC=CC=C1',
            'CC(C)C', 'CN', 'c1ccoc1', '[nH]1cccc1', 'c1ccncc1',
            'CCCCCC', 'C=CC', 'CC#N',
            'C(', 'C1C', ''
        ];

        // 一次性送入页面：生成 → 读 __diag 快照（位置/键长/键序），并在页面内算好重原子间键角
        const results = await page.evaluate(async (smilesList) => {
            const out = [];
            for (const sm of smilesList) {
                try {
                    const r = await window.__generateFromSmiles(sm);
                    if (!r.ok) { out.push({ smiles: sm, ok: false, error: r.error }); continue; }
                    const snapshot = window.__diag.atomPositions();
                    const bondList = window.__diag.bonds().map(b => ({ a: b.pair[0], b: b.pair[1], type: b.type, len: b.len }));
                    // 键角：以每个原子为中心，遍历其所有邻居对（用 _id 关联，不依赖 spec 索引假设）
                    const byId = {};
                    for (const a of snapshot) byId[a.id] = a;
                    const nbMap = {};
                    for (const b of bondList) {
                        (nbMap[b.a] = nbMap[b.a] || []).push(b.b);
                        (nbMap[b.b] = nbMap[b.b] || []).push(b.a);
                    }
                    const angles = [];
                    for (const idStr in nbMap) {
                        const c = byId[+idStr];
                        if (!c) continue;
                        const nbs = nbMap[idStr].map(n => byId[n]).filter(Boolean);
                        for (let i = 0; i < nbs.length; i++) for (let j = i + 1; j < nbs.length; j++) {
                            const v1 = [nbs[i].x - c.x, nbs[i].y - c.y, nbs[i].z - c.z];
                            const v2 = [nbs[j].x - c.x, nbs[j].y - c.y, nbs[j].z - c.z];
                            const dot = (v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / (Math.hypot(...v1) * Math.hypot(...v2));
                            angles.push({ centerType: c.type, angle: Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI });
                        }
                    }
                    out.push({ smiles: sm, ok: true, spec: r.spec, atomCount: r.atomCount, snapshot, bondList, angles });
                } catch (e) {
                    out.push({ smiles: sm, ok: false, error: { pos: -1, msg: '抛异常: ' + String(e) } });
                }
            }
            return out;
        }, SMILES_LIST);

        // ---------- Node 侧几何断言辅助 ----------
        const byId = (snap) => { const m = {}; for (const a of snap) m[a.id] = a; return m; };
        // 两端类型匹配的键（含反向）
        const bondsBetween = (bondList, snap, tA, tB) => {
            const m = byId(snap);
            return bondList.filter(b => {
                const ta = m[b.a].type, tb = m[b.b].type;
                return (ta === tA && tb === tB) || (ta === tB && tb === tA);
            });
        };
        // 指定键序的键
        const bondsOfOrder = (bondList, snap, tA, tB, order) =>
            bondsBetween(bondList, snap, tA, tB).filter(b => Math.abs(b.type - order) < 0.01);
        // 以中心类型 centerType 的原子为顶点、邻居类型限于 nbTypes 的键角（度）
        const anglesAt = (snap, bondList, centerType, nbTypes) => {
            const m = byId(snap);
            const nbMap = {};
            for (const b of bondList) {
                (nbMap[b.a] = nbMap[b.a] || []).push(b.b);
                (nbMap[b.b] = nbMap[b.b] || []).push(b.a);
            }
            const out = [];
            for (const idStr in nbMap) {
                const c = m[+idStr];
                if (!c || c.type !== centerType) continue;
                const nbs = nbMap[idStr].map(n => m[n]).filter(Boolean).filter(n => nbTypes.includes(n.type));
                if (nbs.length < 2) continue;
                for (let i = 0; i < nbs.length; i++) for (let j = i + 1; j < nbs.length; j++) {
                    const v1 = [nbs[i].x - c.x, nbs[i].y - c.y, nbs[i].z - c.z];
                    const v2 = [nbs[j].x - c.x, nbs[j].y - c.y, nbs[j].z - c.z];
                    const dot = (v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / (Math.hypot(...v1) * Math.hypot(...v2));
                    out.push(Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI);
                }
            }
            return out;
        };
        const allNear = (lens, want, tol) => lens.every(l => Math.abs(l - want) <= tol);

        const mk = (name) => { const ac = new AssertionCollector(); report.total++; return ac; };
        const fin = (name, ac, detail) => {
            const pass = ac.failed === 0;
            pass ? report.passed++ : report.failed++;
            report.results.push({ name, pass, detail: detail || (pass ? `通过 ${ac.passed} 个断言` : `失败 ${ac.failed} 个断言: ${ac.failures.join('；')}`), assertions: { passed: ac.passed, failed: ac.failed } });
        };

        const R = (i) => results[i];

        // ---- 01 乙醇 CCO：C-C 1.54 / C-O 1.43 / O-H 0.98 / C-C-O 109.5° ----
        {
            const ac = mk('01 乙醇 CCO');
            const r = R(0);
            ac.ok(r.ok, '生成应成功');
            if (r.ok) {
                ac.eq(r.atomCount, 9, '补氢后总原子数（3 重原子 + 6 H）');
                const cc = bondsOfOrder(r.bondList, r.snapshot, 'C', 'C', 1);
                const co = bondsOfOrder(r.bondList, r.snapshot, 'C', 'O', 1);
                const oh = bondsOfOrder(r.bondList, r.snapshot, 'O', 'H', 1);
                ac.ok(cc.length === 1, `C-C 单键应恰 1 条（实际 ${cc.length}）`);
                if (cc.length === 1) ac.near(cc[0].len, 1.54, 0.04, 'C-C 键长');
                ac.ok(co.length === 1, `C-O 单键应恰 1 条（实际 ${co.length}）`);
                if (co.length === 1) ac.near(co[0].len, 1.43, 0.04, 'C-O 键长');
                ac.ok(oh.length === 1, `O-H 单键应恰 1 条（实际 ${oh.length}）`);
                if (oh.length === 1) ac.near(oh[0].len, 0.98, 0.04, 'O-H 键长');
                const a = anglesAt(r.snapshot, r.bondList, 'C', ['C', 'O']);
                ac.ok(a.length >= 1, `应测得 C-C-O 键角（实际 ${a.length} 个）`);
                if (a.length >= 1) ac.near(Math.min(...a), 109.5, 3, 'C-C-O 键角（取最小，排除其他 C 角）');
            }
            fin('01 乙醇 CCO', ac);
        }

        // ---- 02 乙酸 CC(=O)O：C=O 1.244 / C-O 1.43 / O=C-O 120° ----
        {
            const ac = mk('02 乙酸 CC(=O)O');
            const r = R(1);
            ac.ok(r.ok, '生成应成功');
            if (r.ok) {
                const co2 = bondsOfOrder(r.bondList, r.snapshot, 'C', 'O', 2);
                const co1 = bondsOfOrder(r.bondList, r.snapshot, 'C', 'O', 1);
                ac.ok(co2.length === 1, `C=O 双键应恰 1 条（实际 ${co2.length}）`);
                if (co2.length === 1) ac.near(co2[0].len, 1.244, 0.04, 'C=O 键长');
                ac.ok(co1.length === 1, `C-O 单键应恰 1 条（实际 ${co1.length}）`);
                if (co1.length === 1) ac.near(co1[0].len, 1.43, 0.04, 'C-O 键长');
                const a = anglesAt(r.snapshot, r.bondList, 'C', ['O']);
                ac.ok(a.length === 1, `应测得 O=C-O 键角（实际 ${a.length} 个）`);
                if (a.length === 1) ac.near(a[0], 120, 3, 'O=C-O 键角');
            }
            fin('02 乙酸 CC(=O)O', ac);
        }

        // ---- 03 环丙烷 C1CC1：3 条环 C-C 全 1.54 ----
        {
            const ac = mk('03 环丙烷 C1CC1');
            const r = R(2);
            ac.ok(r.ok, '生成应成功');
            if (r.ok) {
                const cc = bondsOfOrder(r.bondList, r.snapshot, 'C', 'C', 1);
                ac.eq(cc.length, 3, `环 C-C 单键数 3（实际 ${cc.length}）`);
                if (cc.length === 3) {
                    const lens = cc.map(b => b.len);
                    ac.ok(allNear(lens, 1.54, 0.04), `3 条环键长均 ≈1.54（±0.04）: ${lens.join(',')}`);
                }
            }
            fin('03 环丙烷 C1CC1', ac);
        }

        // ---- 04 苯 c1ccccc1：6 条 1.5 键 1.40 / 环内角 120° ----
        {
            const ac = mk('04 苯 c1ccccc1');
            const r = R(3);
            ac.ok(r.ok, '生成应成功');
            if (r.ok) {
                const ar = bondsOfOrder(r.bondList, r.snapshot, 'C', 'C', 1.5);
                ac.eq(ar.length, 6, `芳香 C-C 键数 6（实际 ${ar.length}）`);
                if (ar.length === 6) {
                    const lens = ar.map(b => b.len);
                    ac.ok(allNear(lens, 1.40, 0.04), `6 条环键长均 ≈1.40（±0.04）: ${lens.join(',')}`);
                }
                const a = anglesAt(r.snapshot, r.bondList, 'C', ['C']);
                ac.eq(a.length, 6, `6 个环内角可测（实际 ${a.length}）`);
                if (a.length === 6) {
                    const avg = a.reduce((s, v) => s + v, 0) / 6;
                    ac.near(avg, 120, 3, `环内角均值 ≈120°（实际 ${avg.toFixed(1)}°）`);
                }
            }
            fin('04 苯 c1ccccc1', ac);
        }

        // ---- 05 氢氰酸 C#N：C≡N 三键 ≈1.154 ----
        // 注意：管线目标键长 = (rC + rN) × 0.78 = (0.77 + 0.71) × 0.78 = 1.154（半径和 1.48，
        // 而非任务描述里误用的 C-C 1.54 基准）。实测 1.154 符合实现，非管线缺陷。
        {
            const ac = mk('05 氢氰酸 C#N');
            const r = R(4);
            ac.ok(r.ok, '生成应成功');
            if (r.ok) {
                const cn = bondsOfOrder(r.bondList, r.snapshot, 'C', 'N', 3);
                ac.ok(cn.length === 1, `C≡N 三键应恰 1 条（实际 ${cn.length}）`);
                if (cn.length === 1) ac.near(cn[0].len, 1.154, 0.04, 'C≡N 键长（目标 (0.77+0.71)×0.78=1.154）');
            }
            fin('05 氢氰酸 C#N', ac);
        }

        // ---- 06 Kekulé 苯 C1=CC=CC=C1：交替键序，6 环键全在 1.30-1.60 ----
        {
            const ac = mk('06 Kekulé 苯 C1=CC=CC=C1');
            const r = R(5);
            ac.ok(r.ok, '生成应成功');
            if (r.ok) {
                const cc = bondsBetween(r.bondList, r.snapshot, 'C', 'C');
                ac.eq(cc.length, 6, `环 C-C 键数 6（实际 ${cc.length}）`);
                if (cc.length === 6) {
                    const lens = cc.map(b => b.len);
                    const lo = 1.30, hi = 1.60;
                    ac.ok(lens.every(l => l >= lo && l <= hi), `6 条环键长均在 ${lo}-${hi}: ${lens.join(',')}`);
                }
            }
            fin('06 Kekulé 苯 C1=CC=CC=C1', ac);
        }

        // ---- 07 异丁烷 CC(C)C：3 条 C-C 全 1.54（4 C） ----
        {
            const ac = mk('07 异丁烷 CC(C)C');
            const r = R(6);
            ac.ok(r.ok, '生成应成功');
            if (r.ok) {
                const cc = bondsOfOrder(r.bondList, r.snapshot, 'C', 'C', 1);
                ac.eq(cc.length, 3, `C-C 单键数 3（实际 ${cc.length}）`);
                if (cc.length === 3) {
                    const lens = cc.map(b => b.len);
                    ac.ok(allNear(lens, 1.54, 0.04), `3 条 C-C 键长均 ≈1.54（±0.04）: ${lens.join(',')}`);
                }
            }
            fin('07 异丁烷 CC(C)C', ac);
        }

        // ---- 08 甲胺 CN：C-N 1.47 ----
        {
            const ac = mk('08 甲胺 CN');
            const r = R(7);
            ac.ok(r.ok, '生成应成功');
            if (r.ok) {
                const cn = bondsOfOrder(r.bondList, r.snapshot, 'C', 'N', 1);
                ac.ok(cn.length === 1, `C-N 单键应恰 1 条（实际 ${cn.length}）`);
                if (cn.length === 1) ac.near(cn[0].len, 1.47, 0.04, 'C-N 键长');
            }
            fin('08 甲胺 CN', ac);
        }

        // ---- 09 呋喃 c1ccoc1：环 1.5 键（C-C 1.40、C-O 1.36） ----
        {
            const ac = mk('09 呋喃 c1ccoc1');
            const r = R(8);
            ac.ok(r.ok, '生成应成功');
            if (r.ok) {
                const cc = bondsOfOrder(r.bondList, r.snapshot, 'C', 'C', 1.5);
                const co = bondsOfOrder(r.bondList, r.snapshot, 'C', 'O', 1.5);
                ac.eq(cc.length, 3, `芳香 C-C 键数 3（实际 ${cc.length}）`);
                if (cc.length === 3) {
                    const lens = cc.map(b => b.len);
                    ac.ok(allNear(lens, 1.40, 0.04), `C-C 键长均 ≈1.40（±0.04）: ${lens.join(',')}`);
                }
                ac.eq(co.length, 2, `芳香 C-O 键数 2（实际 ${co.length}）`);
                if (co.length === 2) {
                    const lens = co.map(b => b.len);
                    ac.ok(allNear(lens, 1.36, 0.04), `C-O 键长均 ≈1.36（±0.04）: ${lens.join(',')}`);
                }
            }
            fin('09 呋喃 c1ccoc1', ac);
        }

        // ---- 10 吡咯 [nH]1cccc1：环 1.5 键（C-C 1.40、C-N 1.34） ----
        {
            const ac = mk('10 吡咯 [nH]1cccc1');
            const r = R(9);
            ac.ok(r.ok, '生成应成功');
            if (r.ok) {
                const cc = bondsOfOrder(r.bondList, r.snapshot, 'C', 'C', 1.5);
                const cn = bondsOfOrder(r.bondList, r.snapshot, 'C', 'N', 1.5);
                ac.eq(cc.length, 3, `芳香 C-C 键数 3（实际 ${cc.length}）`);
                if (cc.length === 3) {
                    const lens = cc.map(b => b.len);
                    ac.ok(allNear(lens, 1.40, 0.04), `C-C 键长均 ≈1.40（±0.04）: ${lens.join(',')}`);
                }
                ac.eq(cn.length, 2, `芳香 C-N 键数 2（实际 ${cn.length}）`);
                if (cn.length === 2) {
                    const lens = cn.map(b => b.len);
                    ac.ok(allNear(lens, 1.34, 0.04), `C-N 键长均 ≈1.34（±0.04）: ${lens.join(',')}`);
                }
            }
            fin('10 吡咯 [nH]1cccc1', ac);
        }

        // ---- 11 吡啶 c1ccncc1：环 1.5 键（C-C 1.40、C-N 1.34） ----
        {
            const ac = mk('11 吡啶 c1ccncc1');
            const r = R(10);
            ac.ok(r.ok, '生成应成功');
            if (r.ok) {
                const cc = bondsOfOrder(r.bondList, r.snapshot, 'C', 'C', 1.5);
                const cn = bondsOfOrder(r.bondList, r.snapshot, 'C', 'N', 1.5);
                ac.eq(cc.length, 4, `芳香 C-C 键数 4（实际 ${cc.length}）`);
                if (cc.length === 4) {
                    const lens = cc.map(b => b.len);
                    ac.ok(allNear(lens, 1.40, 0.04), `C-C 键长均 ≈1.40（±0.04）: ${lens.join(',')}`);
                }
                ac.eq(cn.length, 2, `芳香 C-N 键数 2（实际 ${cn.length}）`);
                if (cn.length === 2) {
                    const lens = cn.map(b => b.len);
                    ac.ok(allNear(lens, 1.34, 0.04), `C-N 键长均 ≈1.34（±0.04）: ${lens.join(',')}`);
                }
            }
            fin('11 吡啶 c1ccncc1', ac);
        }

        // ---- 12 己烷 CCCCCC：5 条 C-C 全 1.54 ----
        {
            const ac = mk('12 己烷 CCCCCC');
            const r = R(11);
            ac.ok(r.ok, '生成应成功');
            if (r.ok) {
                const cc = bondsOfOrder(r.bondList, r.snapshot, 'C', 'C', 1);
                ac.eq(cc.length, 5, `C-C 单键数 5（实际 ${cc.length}）`);
                if (cc.length === 5) {
                    const lens = cc.map(b => b.len);
                    ac.ok(allNear(lens, 1.54, 0.04), `5 条 C-C 键长均 ≈1.54（±0.04）: ${lens.join(',')}`);
                }
            }
            fin('12 己烷 CCCCCC', ac);
        }

        // ---- 13 丙烯 C=CC：C=C 1.34、C-C 1.54 ----
        {
            const ac = mk('13 丙烯 C=CC');
            const r = R(12);
            ac.ok(r.ok, '生成应成功');
            if (r.ok) {
                const ccd = bondsOfOrder(r.bondList, r.snapshot, 'C', 'C', 2);
                const ccs = bondsOfOrder(r.bondList, r.snapshot, 'C', 'C', 1);
                ac.ok(ccd.length === 1, `C=C 双键应恰 1 条（实际 ${ccd.length}）`);
                if (ccd.length === 1) ac.near(ccd[0].len, 1.34, 0.04, 'C=C 键长');
                ac.ok(ccs.length === 1, `C-C 单键应恰 1 条（实际 ${ccs.length}）`);
                if (ccs.length === 1) ac.near(ccs[0].len, 1.54, 0.04, 'C-C 键长');
            }
            fin('13 丙烯 C=CC', ac);
        }

        // ---- 14 乙腈 CC#N：C≡N 1.154 ----
        {
            const ac = mk('14 乙腈 CC#N');
            const r = R(13);
            ac.ok(r.ok, '生成应成功');
            if (r.ok) {
                const cn = bondsOfOrder(r.bondList, r.snapshot, 'C', 'N', 3);
                ac.ok(cn.length === 1, `C≡N 三键应恰 1 条（实际 ${cn.length}）`);
                if (cn.length === 1) ac.near(cn[0].len, 1.154, 0.04, 'C≡N 键长（目标 (0.77+0.71)×0.78=1.154）');
            }
            fin('14 乙腈 CC#N', ac);
        }

        // ---- 15 错误路径 C( ----
        {
            const ac = mk('15 错误路径 C(');
            const r = R(14);
            ac.eq(r.ok, false, '应返回 ok:false');
            ac.ok(!!r.error, '应携带 error');
            if (r.error) {
                ac.ok(typeof r.error.msg === 'string' && r.error.msg.length > 0, `error.msg 应为非空字符串（实际 ${JSON.stringify(r.error.msg)}）`);
            }
            fin('15 错误路径 C(', ac);
        }

        // ---- 16 错误路径 C1C ----
        {
            const ac = mk('16 错误路径 C1C');
            const r = R(15);
            ac.eq(r.ok, false, '应返回 ok:false');
            ac.ok(!!r.error, '应携带 error');
            if (r.error) {
                ac.ok(typeof r.error.msg === 'string' && r.error.msg.length > 0, `error.msg 应为非空字符串（实际 ${JSON.stringify(r.error.msg)}）`);
            }
            fin('16 错误路径 C1C', ac);
        }

        // ---- 17 错误路径 空串 ----
        {
            const ac = mk('17 错误路径 空串');
            const r = R(16);
            ac.eq(r.ok, false, '应返回 ok:false');
            ac.ok(!!r.error, '应携带 error');
            if (r.error) {
                ac.ok(typeof r.error.msg === 'string' && r.error.msg.length > 0, `error.msg 应为非空字符串（实际 ${JSON.stringify(r.error.msg)}）`);
            }
            fin('17 错误路径 空串', ac);
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
