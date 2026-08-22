// verify_anchor_priority.js — 基团放置锚点两阶段语义验证(v2)
// 场景A(direct 优先):甲烷(全饱和)+ 孤立 O(未饱和);放置点靠近甲烷C(replace score 更优)
//   → 新逻辑必须连 O,且甲烷 4H 全部保留
// 场景B(replace 回退):苯全带 H(无 direct 候选)→ 拖羧基取代最近环碳 H
// 场景C(direct 不删 H):甲胺 CN,N 未饱和;甲基拖到 N 上方 → 连 N 且不删任何 H
const { chromium } = require('playwright');
const http = require('http');
const PORT = 8035;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=anchor2`;
async function probe(url) { return new Promise(res => { const req = http.get(url, r => { r.resume(); res(true); }); req.on('error', () => res(false)); req.setTimeout(3000, () => { req.destroy(); res(false); }); }); }
async function waitPort(ms) { const dl = Date.now() + ms; while (Date.now() < dl) { if (await probe(`http://127.0.0.1:${PORT}/`)) return true; await new Promise(r => setTimeout(r, 500)); } return false; }
async function ensureServer() { if (await waitPort(1000)) return null; const { spawn } = require('child_process'); for (const bin of ['python', 'py']) { const p = spawn(bin, ['-m', 'http.server', String(PORT)], { stdio: 'ignore', cwd: process.cwd() }); if (await waitPort(15000)) return p; p.kill(); } return null; }
(async () => {
    const serverProc = await ensureServer();
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const report = { results: [], consoleErrors: [] };
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 400)));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
    try {
        await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => typeof window.__createCompleteGroup === 'function' && typeof window.__createHeavyAtom === 'function', null, { timeout: 30000 });
        const out = {};
        const step = (name, ok, detail) => report.results.push({ name, ok: !!ok, detail });

        // ---------- 场景 A:direct(未饱和)优先于 score 更优的 replace ----------
        out.A = await page.evaluate(() => {
            window.__diag.generateSpec('methane');
            window.__diag.runOpt();
            // 孤立 O 放在甲烷右侧 2.3 处（σ=0 未饱和 → direct 候选）
            const pos0 = window.__diag.atomPositions();
            const cAtom = pos0.find(a => a.type === 'C');
            window.__createHeavyAtom('O', { x: cAtom.x + 2.3, y: cAtom.y, z: cAtom.z });
            // 放置点：甲烷 C 右方偏上，dist(C)=~1.19（replace score≈0.35 优于 O 的 ~0.9）
            const pos = window.__diag.atomPositions();
            const byId = {}; pos.forEach(p => byId[p.id] = p);
            const c2 = pos.filter(a => a.type === 'C')[0];
            const oIso = pos.filter(a => a.type === 'O')[0];
            if (!oIso) return { fail: 'iso O missing' };
            const place = { x: c2.x + 1.15, y: c2.y + 0.3, z: c2.z };
            const hBefore = pos.filter(a => a.type === 'H').length;
            const meshes = window.__createCompleteGroup('carboxyl', place);
            if (!meshes || !meshes.length) return { fail: 'group not placed' };
            const gIds = new Set(meshes.map(m => m.userData._id));
            const cross = window.__diag.bonds().filter(b => gIds.has(b.pair[0]) !== gIds.has(b.pair[1]));
            const otherId = cross.length ? (gIds.has(cross[0].pair[0]) ? cross[0].pair[1] : cross[0].pair[0]) : null;
            const otherType = otherId ? byId[otherId].type : '?';
            const hAfter = window.__diag.atomPositions().filter(a => a.type === 'H').length;
            const groupH = meshes.filter(m => m.userData.atomType === 'H').length;
            return {
                crossCount: cross.length, connectedType: otherType,
                hBefore, hAfter, groupH,
                chHIntact: hAfter - groupH === hBefore, // 甲烷 4H 未动
                bondLen: cross.length ? +cross[0].len.toFixed(3) : 0
            };
        });
        step('A: 连未饱和O(direct)而非score更优的甲烷C(replace),甲烷H全保留',
            out.A.connectedType === 'O' && out.A.crossCount === 1 && out.A.chHIntact, out.A);

        // ---------- 场景 B:全饱和回退为取代氢 ----------
        await page.click('#btn-clear-molecule');
        out.B = await page.evaluate(() => {
            window.__diag.generateSpec('benzene');
            window.__diag.runOpt();
            const before = window.__diag.atomPositions();
            const hBefore = before.filter(a => a.type === 'H').length;
            const meshes = window.__createCompleteGroup('carboxyl', { x: 2.4, y: 0, z: 0 });
            if (!meshes || !meshes.length) return { fail: 'group not placed' };
            const gIds = new Set(meshes.map(m => m.userData._id));
            const cross = window.__diag.bonds().filter(b => gIds.has(b.pair[0]) !== gIds.has(b.pair[1]));
            const after = window.__diag.atomPositions();
            const hAfter = after.filter(a => a.type === 'H').length;
            const groupH = meshes.filter(m => m.userData.atomType === 'H').length;
            const replaced = hBefore + groupH - hAfter;
            return { hBefore, hAfter, groupH, replaced, crossCount: cross.length, bondLen: cross.length ? +cross[0].len.toFixed(3) : 0 };
        });
        step('B: 全饱和时回退取代最近环碳H(恰好1个)', out.B.replaced === 1 && out.B.crossCount === 1 && Math.abs(out.B.bondLen - 1.54) < 0.12, out.B);

        // ---------- 场景 C:满价 N 带 H → 取代其一个 H(二甲胺语义) ----------
        out.C = await (async () => {
            await page.click('#btn-clear-molecule');
            return await page.evaluate(async () => {
                const g = await window.__generateFromSmiles('CN'); // CH3-NH2, N 满价(C+2H=σ3) 但带可替换 H
                if (!g || !g.ok) return { fail: 'gen CN failed' };
                const pos = window.__diag.atomPositions();
                let nA = null;
                for (const a of pos) if (a.type === 'N') nA = a;
                if (!nA) return { fail: 'N not found' };
                const place = { x: nA.x, y: nA.y + 1.25, z: nA.z }; // N 上方
                const hBefore = pos.filter(a => a.type === 'H').length;
                const meshes = window.__createCompleteGroup('methyl', place);
                if (!meshes || !meshes.length) return { fail: 'not placed' };
                const gIds = new Set(meshes.map(m => m.userData._id));
                const cross = window.__diag.bonds().filter(b => gIds.has(b.pair[0]) !== gIds.has(b.pair[1]));
                const otherId = cross.length ? (gIds.has(cross[0].pair[0]) ? cross[0].pair[1] : cross[0].pair[0]) : null;
                const after = window.__diag.atomPositions();
                const connectedType = otherId ? (after.find(a => a.id === otherId) || {}).type : '?';
                const hAfter = after.filter(a => a.type === 'H').length;
                const groupH = meshes.filter(m => m.userData.atomType === 'H').length;
                return {
                    crossCount: cross.length, connectedType,
                    replacedExpected: 1, replacedActual: hBefore + groupH - hAfter,
                    bondLen: cross.length ? +cross[0].len.toFixed(3) : 0
                };
            });
        })();
        step('C: 满价N带H→取代恰好1个N-H成二甲胺', out.C && out.C.crossCount === 1 && out.C.connectedType === 'N' && out.C.replacedActual === out.C.replacedExpected && Math.abs(out.C.bondLen - 1.48) < 0.12, out.C);

        console.log(JSON.stringify(report, null, 1));
    } catch (e) {
        report.results.push({ name: 'FATAL', ok: false, data: String(e).slice(0, 400) });
        console.log(JSON.stringify(report, null, 1));
    }
    await browser.close();
    if (serverProc) serverProc.kill();
})().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });