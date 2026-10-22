// verify_lone_pairs.js — 孤对电子云「半透明浅蓝 + 水滴形」材质验证（2026-10-20 / 10-21）
// 覆盖：甲醇 O 两朵浅蓝云（颜色/透明度/可见性）+ 云内 2×2 金属电子点、C/H 不误画、
//       显示/隐藏开关、甲胺 N 一朵、苯（无孤对）零云、水滴形轮廓（尖端收尖/最宽处/长宽）、
//       浅蓝色值、零 console 错误。
// 运行：cmd /c "node verify_lone_pairs.js > verify_lone_pairs.json 2>&1"（timeout 900000ms）
const { chromium } = require('playwright');
const http = require('http');
const { spawn } = require('child_process');

const PORT = 8062;
const PAGE_URL = `http://127.0.0.1:${PORT}/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=lp1`;
const EXPECT_COLOR = '#9fd0ff';
const EXPECT_OPACITY = 0.72;

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
        await page.waitForFunction(() => !!(window.__diag && window.__lpStats && window.__toggleLonePairs), null, { timeout: 30000 });
        await page.waitForTimeout(400);

        // 生成示例 + 开关一次（示例生成器不自动刷新孤对，关→开触发 __lpDirs 计算）
        const gen = async (name) => {
            await page.evaluate((n) => window.__diag.generate(n), name);
            await page.evaluate(() => { window.__toggleLonePairs(); window.__toggleLonePairs(); });
            await page.waitForTimeout(350);
            return page.evaluate(() => window.__lpStats());
        };
        const cloudsOf = (row) => row.meshes.filter(m => m.r > 0.3);
        const dotsOf = (row) => row.meshes.filter(m => m.r <= 0.3);

        // L1 甲醇：O 两朵浅蓝云 + 4 个电子点，颜色/透明度正确
        const me = await gen('methanol');
        const oRow = me.find(r => r.t === 'O');
        const oClouds = cloudsOf(oRow), oDots = dotsOf(oRow);
        step('L1 甲醇 O：2 朵云颜色 #9fd0ff / α=0.72 / 可见',
            oRow && oRow.nLP === 2 && oClouds.length === 2
            && oClouds.every(c => c.color === EXPECT_COLOR && Math.abs(c.opacity - EXPECT_OPACITY) < 1e-9 && c.vis),
            { nLP: oRow && oRow.nLP, clouds: oClouds });

        // L2 云内电子点为金属材质（2026-10-21 用户要求）+ 近黑基色（10-22 用户要求"改成黑色"）：
        // MeshStandardMaterial、黑铬 #15181c、metalness 0.95、roughness 0.22
        step('L2 甲醇 O：云内 2×2 黑色金属电子点（MeshStandardMaterial / metalness 0.95 / #15181c）',
            oDots.length === 4 && oDots.every(d => d.type === 'MeshStandardMaterial'
                && Math.abs(d.metalness - 0.95) < 1e-6 && Math.abs(d.roughness - 0.22) < 1e-6
                && d.color === '#15181c' && d.vis),
            { dots: oDots });

        // L3 C/H 不误画孤对
        const otherRows = me.filter(r => r.t !== 'O');
        step('L3 甲醇 C/H 不显示孤对云',
            otherRows.length > 0 && otherRows.every(r => r.nLP === 0 && r.meshes.length === 0),
            { others: otherRows.map(r => ({ t: r.t, nLP: r.nLP, meshes: r.meshes.length })) });

        // 记录水滴轮廓（此时甲醇云仍在画布上，末尾 L9 断言）
        const drop = await page.evaluate(() => window.__lpDropProfile());

        // L4 显示/隐藏开关：关 → 全部不可见；开 → 全部恢复
        const off = await page.evaluate(() => { window.__toggleLonePairs(); return window.__lpStats().filter(r => r.meshes.length).flatMap(r => r.meshes.map(m => m.vis)); });
        await page.evaluate(() => window.__toggleLonePairs());
        const on = await page.evaluate(() => window.__lpStats().filter(r => r.meshes.length).flatMap(r => r.meshes.map(m => m.vis)));
        step('L4 开关：关→全部隐藏、开→全部恢复',
            off.length > 0 && off.every(v => v === false) && on.length === off.length && on.every(v => v === true),
            { off, on });

        // L5 甲胺：N 一朵云（2 个电子点）
        const ma = await gen('methylamine');
        const nRow = ma.find(r => r.t === 'N');
        step('L5 甲胺 N：1 朵浅蓝云 + 2 个电子点',
            nRow && nRow.nLP === 1 && cloudsOf(nRow).length === 1 && cloudsOf(nRow)[0].color === EXPECT_COLOR && dotsOf(nRow).length === 2,
            { nLP: nRow && nRow.nLP, clouds: nRow && cloudsOf(nRow), dots: nRow && dotsOf(nRow).length });

        // L6 苯（无孤对）：全分子零云
        const bz = await gen('benzene');
        const bzMeshes = bz.reduce((n, r) => n + r.meshes.length, 0);
        step('L6 苯：无孤对电子（零云、零电子点）', bz.length > 0 && bzMeshes === 0, { atoms: bz.length, meshes: bzMeshes });

        // L9 水滴形轮廓（用户 2026-10-21 需求，参考 nobook H₂O）：尖端收尖、圆肚朝外、最宽处在中后段
        step('L9 水滴轮廓：尖端半径 < 30% 最大半径、最宽处在 55%-80%、长≈1.28 / 最大半径≈0.40',
            !!drop && Math.abs(drop.length - 1.28) < 0.02 && Math.abs(drop.maxR - 0.40) < 0.01
            && drop.tipR < drop.maxR * 0.3 && drop.widestAt >= 0.55 && drop.widestAt <= 0.80
            && drop.minY >= -0.001 && Math.abs(drop.maxY - drop.length) < 0.01,
            drop);

        // L7 颜色确为「浅蓝」：蓝分量最高、整体亮度偏高、色相在蓝区
        const rgb = { r: parseInt(EXPECT_COLOR.slice(1, 3), 16), g: parseInt(EXPECT_COLOR.slice(3, 5), 16), b: parseInt(EXPECT_COLOR.slice(5, 7), 16) };
        const mx = Math.max(rgb.r, rgb.g, rgb.b), mn = Math.min(rgb.r, rgb.g, rgb.b);
        let hue = 0;
        if (mx !== mn) {
            const d = mx - mn;
            hue = mx === rgb.r ? 60 * (((rgb.g - rgb.b) / d) % 6) : (mx === rgb.g ? 60 * ((rgb.b - rgb.r) / d + 2) : 60 * ((rgb.r - rgb.g) / d + 4));
            if (hue < 0) hue += 360;
        }
        const light = (mx + mn) / 2 / 255;
        step('L7 色值为浅蓝（B 最高、色相 200-230°、明度 > 0.6）',
            rgb.b > rgb.g && rgb.g > rgb.r && rgb.b >= 200 && hue >= 200 && hue <= 230 && light > 0.6,
            { hex: EXPECT_COLOR, rgb, hue: +hue.toFixed(1), light: +light.toFixed(2) });

        // L8 零 console 错误
        step('L8 零 console 错误', report.consoleErrors.length === 0, report.consoleErrors);
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
    console.log(`\n== verify_lone_pairs: ${passed}/${report.total} passed, ${report.failed} failed (${report.elapsedMs}ms) ==`);
    require('fs').writeFileSync('verify_lone_pairs.json', JSON.stringify(report, null, 1));
    process.exit(report.failed ? 1 : 0);
})();
