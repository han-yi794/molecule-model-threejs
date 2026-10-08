// 手摆畸变复现 —— 模拟手动放置乙醛:甲基 3H 聚拢在甲基一侧窄锥内,但连接正确,
// 一键优化后检查键角是否恢复 + 连接性是否保持。附带大扰动连接性探针。
// 运行: python -m http.server 8000 (脚本会自动拉起)
//   cmd /c "node verify_distort.js > verify_distort.json 2>&1"
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

(async () => {
    const t0 = Date.now();
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const report = { passed: 0, failed: 0, total: 0, results: [], consoleErrors: [], elapsedMs: 0 };
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });

    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(
            () => !!(window.__diag && window.__createHeavyAtom && window.__manualBond && window.__diag.runOpt),
            null, { timeout: 30000 });

        // ---------- 场景 1:手摆乙醛,甲基 3H 聚拢,连接正确 → 一键优化 ----------
        const s1 = await page.evaluate(() => {
            const out = { err: null };
            try {
                const start = window.__diag.atomPositions().length;
                out.startAtoms = start;
                // 骨架: C1 甲基(0,0,0) — C2 羰基(1.54,0,0) =O(120°方向,1.22) + 醛H(240°方向,1.09)
                const C1 = window.__createHeavyAtom('C', { x: 0, y: 0, z: 0 });
                const C2 = window.__createHeavyAtom('C', { x: 1.54, y: 0, z: 0 });
                const O = window.__createHeavyAtom('O', { x: 1.54 - 0.61, y: 1.057, z: 0 });
                const Hald = window.__createHeavyAtom('H', { x: 1.54 - 0.545, y: -0.944, z: 0 });
                // 甲基 3H:全部挤在 -X 侧窄锥内(两两夹角约 10°),键长正确 1.09
                const cone = [[-1, 0.18, 0.12], [-1, 0.02, 0.30], [-1, 0.30, -0.10]];
                const Hs = cone.map(d => {
                    const l = Math.hypot(d[0], d[1], d[2]);
                    return window.__createHeavyAtom('H', { x: d[0] / l * 1.09, y: d[1] / l * 1.09, z: d[2] / l * 1.09 });
                });
                const b1 = window.__manualBond(C1, C2, 1);
                const b2 = window.__manualBond(C2, O, 2);
                const b3 = window.__manualBond(C2, Hald, 1);
                const hb = Hs.map(h => window.__manualBond(C1, h, 1));
                out.manualBondsOk = !!(b1 && b2 && b3 && hb.every(Boolean));
                // 走真实手动放置路径:一次 proximity updateBonds(可能产生误增键,照实记录)
                window.__diag.updateBonds();
                const norm = v => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
                const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
                const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
                const hdirs = Hs.map(h => norm(sub(h.position, C1.position)));
                const mut = [];
                for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++)
                    mut.push(Math.acos(Math.max(-1, Math.min(1, dot(hdirs[i], hdirs[j])))) * 180 / Math.PI);
                out.hMutualDeg = mut.map(x => +x.toFixed(1));
                out.preBonds = window.__diag.bonds();
                out.preAngles = window.__diag.angleDiag();
                window.__TRACE_OPT = { traces: [], limit: 300 };
                window.__diag.runOpt();
                out.traceLen = (window.__TRACE_OPT.traces || []).length;
                window.__TRACE_OPT = null;
                out.postBonds = window.__diag.bonds();
                out.postAngles = window.__diag.angleDiag();
                out.postAtomCount = window.__diag.atomPositions().length;
            } catch (e) { out.err = String(e && e.stack || e).slice(0, 500); }
            return out;
        });

        {
            const methyl = (s1.postAngles || []).find(a => a.type === 'C' && a.angles && a.angles.length === 6);
            const worstDev = methyl ? Math.max(...methyl.angles.map(a => Math.abs(a - 109.47))) : null;
            const prePairs = JSON.stringify((s1.preBonds || []).map(b => b.pair.slice().sort((x, y) => x - y).join('-') + ':' + b.type).sort());
            const postPairs = JSON.stringify((s1.postBonds || []).map(b => b.pair.slice().sort((x, y) => x - y).join('-') + ':' + b.type).sort());
            const pass = !s1.err && s1.manualBondsOk && worstDev !== null && worstDev < 8
                && prePairs === postPairs && s1.postAtomCount === 7;
            pass ? report.passed++ : report.failed++; report.total++;
            report.results.push({
                name: '1 手摆乙醛聚拢H一键优化恢复', pass,
                detail: s1.err ? ('ERR ' + s1.err) : ('H两两夹角初值[' + s1.hMutualDeg.join(',') + ']° 优化后甲基最大偏离' +
                    (worstDev === null ? 'N/A' : worstDev.toFixed(1)) + '°(要求<8°) 连接' +
                    (prePairs === postPairs ? '保持' : '被改动 pre=' + prePairs + ' post=' + postPairs) +
                    ' 原子数' + s1.postAtomCount + ' 追踪轮数' + s1.traceLen +
                    ' 甲基std=' + (methyl ? methyl.std : 'N/A')),
            });
            report._s1 = s1;
        }

        // ---------- 场景 1b:3H 聚拢在两碳之间(朝羰基侧),连接正确 → 一键优化 ----------
        const s1b = await page.evaluate(() => {
            const out = { err: null };
            try {
                const C1 = window.__createHeavyAtom('C', { x: 10, y: 0, z: 0 });
                const C2 = window.__createHeavyAtom('C', { x: 11.54, y: 0, z: 0 });
                const O = window.__createHeavyAtom('O', { x: 11.54 - 0.61, y: 1.057, z: 0 });
                const Hald = window.__createHeavyAtom('H', { x: 11.54 - 0.545, y: -0.944, z: 0 });
                // 3H 聚拢在 +X 锥内(朝 C2 一侧),键长 1.09 → 距 C2 仅 0.45,进入成键阈值
                const cone = [[1, 0.18, 0.12], [1, 0.02, 0.30], [1, 0.30, -0.10]];
                const Hs = cone.map(d => {
                    const l = Math.hypot(d[0], d[1], d[2]);
                    return window.__createHeavyAtom('H', { x: 10 + d[0] / l * 1.09, y: d[1] / l * 1.09, z: d[2] / l * 1.09 });
                });
                window.__manualBond(C1, C2, 1);
                window.__manualBond(C2, O, 2);
                window.__manualBond(C2, Hald, 1);
                Hs.forEach(h => window.__manualBond(C1, h, 1));
                window.__diag.updateBonds();
                out.preBonds = window.__diag.bonds();
                out.preAngles = window.__diag.angleDiag();
                window.__diag.runOpt();
                out.postBonds = window.__diag.bonds();
                out.postAngles = window.__diag.angleDiag();
                out.postAtomCount = window.__diag.atomPositions().length;
            } catch (e) { out.err = String(e && e.stack || e).slice(0, 500); }
            return out;
        });
        {
            const methyls = (s1b.postAngles || []).filter(a => a.type === 'C' && a.angles && a.angles.length >= 6);
            const worstDev = methyls.length ? Math.max(...methyls.map(m => Math.max(...m.angles.map(a => Math.abs(a - 109.47))))) : null;
            const worstStd = methyls.length ? Math.max(...methyls.map(m => m.std)) : null;
            const key = b => b.pair.slice().sort((x, y) => x - y).join('-') + ':' + b.type;
            const preSet = new Set((s1b.preBonds || []).map(key));
            const gained = (s1b.postBonds || []).filter(b => !preSet.has(key(b)));
            const pass = !s1b.err && worstDev !== null && worstDev < 8 && gained.length === 0;
            pass ? report.passed++ : report.failed++; report.total++;
            report.results.push({
                name: '1b H挤两碳之间一键优化恢复', pass,
                detail: s1b.err ? ('ERR ' + s1b.err) : ('优化后甲基最大偏离' +
                    (worstDev === null ? 'N/A' : worstDev.toFixed(1)) + '°(要求<8°) 优化期误增键' + gained.length + '条' +
                    (gained.length ? JSON.stringify(gained.map(g => ({ pair: g.pair, types: g.types, len: g.len }))) : '') +
                    ' 甲基std(最差)=' + (worstStd === null ? 'N/A' : worstStd)),
            });
            report._s1b = s1b;
        }

        // ---------- 场景 1c:按手摆顺序(醛基→甲基碳→甲基H),H 距 C2 三档 → 真实手摆路径 ----------
        // 每档独立刷新页面,互不干扰
        const runCaseC = async (hFromC1) => await page.evaluate(({ hFromC1 }) => {
            const out = { err: null };
            try {
                // ①先放醛基: C2 + O(双键) + 醛H
                const C2 = window.__createHeavyAtom('C', { x: 0, y: 0, z: 0 });
                const O = window.__createHeavyAtom('O', { x: -0.61, y: 1.057, z: 0 });
                const Hald = window.__createHeavyAtom('H', { x: -0.545, y: -0.944, z: 0 });
                window.__manualBond(C2, O, 2);
                window.__manualBond(C2, Hald, 1);
                // ②再放甲基碳: C1 在 -X 侧 1.54 处成键
                const C1 = window.__createHeavyAtom('C', { x: -1.54, y: 0, z: 0 });
                window.__manualBond(C1, C2, 1);
                // ③最后放 3 个甲基 H:聚拢在 +X 锥内(朝 C2 一侧),距 C1 hFromC1
                const cone = [[1, 0.18, 0.12], [1, 0.02, 0.30], [1, 0.30, -0.10]];
                const Hs = cone.map(d => {
                    const l = Math.hypot(d[0], d[1], d[2]);
                    return window.__createHeavyAtom('H', { x: -1.54 + d[0] / l * hFromC1, y: d[1] / l * hFromC1, z: d[2] / l * hFromC1 });
                });
                out.distToC2 = Hs.map(h => +h.position.distanceTo(C2.position).toFixed(3));
                // 真实落下路径: proximity updateBonds 决定成键(可新增)
                window.__diag.updateBonds();
                const ids = [C1, C2, O, Hald, ...Hs].map(a => a.userData._id);
                out.placedBonds = window.__diag.bonds().filter(b => ids.includes(b.pair[0]) && ids.includes(b.pair[1]));
                out.preAngles = window.__diag.angleDiag().filter(a => a.id === C1.userData._id || a.id === C2.userData._id);
                window.__diag.runOpt();
                out.postBonds = window.__diag.bonds().filter(b => ids.includes(b.pair[0]) && ids.includes(b.pair[1]));
                out.postAngles = window.__diag.angleDiag().filter(a => a.id === C1.userData._id || a.id === C2.userData._id);
                // 判别实验:再跑两轮,看是收敛慢还是死锁
                out.restd = [];
                for (let r = 0; r < 2; r++) {
                    window.__diag.runOpt();
                    const m = window.__diag.angleDiag().find(a => a.id === C1.userData._id);
                    out.restd.push(m ? m.std : null);
                }
            } catch (e) { out.err = String(e && e.stack || e).slice(0, 500); }
            return out;
        }, { hFromC1 });
        for (const hFromC1 of [1.09, 1.30, 1.45]) {
            await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
            await page.waitForFunction(
                () => !!(window.__diag && window.__createHeavyAtom && window.__manualBond && window.__diag.runOpt),
                null, { timeout: 30000 });
            const c = await runCaseC(hFromC1);
            const methylEntry = (c.postAngles || []).find(a => a.type === 'C' && a.angles && a.angles.length >= 4);
            const worstDev = methylEntry ? Math.max(...methylEntry.angles.map(a => Math.abs(a - 109.47))) : null;
            const hBonds = (c.postBonds || []).filter(b => b.types.includes('H'));
            // 1.45 档超出 UI 吸附范围(真实 UI 有 hint 必吸附到键长,无 hint 不成键),
            // raw 超阈放置的错键属于已知边界,只记录不计分
            const infoOnly = Math.abs(hFromC1 - 1.45) < 1e-9;
            const pass = infoOnly ? 'info' : (!c.err && worstDev !== null && worstDev < 8);
            if (pass === true) { report.passed++; } else if (pass === false) { report.failed++; }
            report.total++;
            report.results.push({
                name: '1c 手摆顺序H距C1=' + hFromC1, pass,
                detail: c.err ? ('ERR ' + c.err) : ('H距C2' + JSON.stringify(c.distToC2) +
                    ' 落下成键' + JSON.stringify((c.placedBonds || []).map(b => b.types.join('-') + 'x' + b.type)) +
                    ' 优化后甲基' + JSON.stringify(methylEntry ? methylEntry.angles : null) +
                    ' 含H键数' + hBonds.length + '(期望4:甲基3+醛1)' +
                    ' 再跑两轮std=' + JSON.stringify(c.restd || null)),
            });
            report['_s1c_' + String(hFromC1).replace('.', '_')] = c;
        }
        // 场景 2 前刷新页面,避免受 1c 残留分子干扰
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(
            () => !!(window.__diag && window.__diag.perturb && window.__diag.bondsSnapshot),
            null, { timeout: 30000 });
        const s2 = await page.evaluate(({ mag }) => {
            const out = { err: null };
            try {
                // 先摆一个正确的乙醛(同 1c 顺序,H 距 C1 取 1.09,不优化)
                const C2 = window.__createHeavyAtom('C', { x: 0, y: 0, z: 0 });
                const O = window.__createHeavyAtom('O', { x: -0.61, y: 1.057, z: 0 });
                const Hald = window.__createHeavyAtom('H', { x: -0.545, y: -0.944, z: 0 });
                window.__manualBond(C2, O, 2);
                window.__manualBond(C2, Hald, 1);
                const C1 = window.__createHeavyAtom('C', { x: -1.54, y: 0, z: 0 });
                window.__manualBond(C1, C2, 1);
                const cone = [[1, 0.18, 0.12], [1, 0.02, 0.30], [1, 0.30, -0.10]];
                cone.map(d => {
                    const l = Math.hypot(d[0], d[1], d[2]);
                    return window.__createHeavyAtom('H', { x: -1.54 + d[0] / l * 1.09, y: d[1] / l * 1.09, z: d[2] / l * 1.09 });
                }).forEach(h => window.__manualBond(C1, h, 1));
                window.__diag.updateBonds();
                out.pre = window.__diag.bondsSnapshot();
                window.__diag.perturb(mag);
                out.post = window.__diag.bondsSnapshot();
                const key = b => b.pair.slice().sort((x, y) => x - y).join('-') + ':' + b.type;
                const preSet = new Set(out.pre.map(key));
                const postSet = new Set(out.post.map(key));
                out.lost = out.pre.filter(b => !postSet.has(key(b)));
                out.gained = out.post.filter(b => !preSet.has(key(b)));
            } catch (e) { out.err = String(e && e.message || e).slice(0, 300); }
            return out;
        }, { mag: 0.9 });
        {
            const pass = !s2.err && s2.lost.length === 0 && s2.gained.length === 0;
            pass ? report.passed++ : report.failed++; report.total++;
            report.results.push({
                name: '2 扰动0.9连接性保持', pass,
                detail: s2.err ? ('ERR ' + s2.err) : ('断键' + s2.lost.length + '条' +
                    (s2.lost.length ? JSON.stringify(s2.lost) : '') + ' 误增' + s2.gained.length + '条' +
                    (s2.gained.length ? JSON.stringify(s2.gained) : '')),
            });
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
