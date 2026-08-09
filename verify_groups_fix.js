const { chromium } = require('playwright-core');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.page ?? (await browser.newPage());

    const URL_EXTRA = 'http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1';
    const URL_MAIN = 'http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B2.html?noauto=1';
    const URL_PI = 'http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B3.html?noauto=1';

    const report = { initErrors: [], consoleErrors: [], groups: {}, reg4: null, reg2: null, reg3: null };
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));

    await page.goto(URL_EXTRA, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    report.initErrors = (await page.evaluate(() => window.__INIT_ERRORS || [])).slice(0, 20);

    const GROUPS = await page.evaluate(() => Object.keys(window.__GROUP_SPECS || {}));
    const DIRS = [
        { name: 'right', p: { x: 2.4, y: 0, z: 0 } },
        { name: 'up', p: { x: 1.2, y: 2.6, z: 0 } },
        { name: 'above', p: { x: 0.5, y: 0.5, z: 2.2 } },
        { name: 'left', p: { x: -2.2, y: 1.2, z: 0.4 } }
    ];

    for (const key of GROUPS) {
        report.groups[key] = { directions: {} };
        for (const d of DIRS) {
            const res = await page.evaluate(({ key, p }) => {
                const out = { ok: true, errors: [], crossBonds: 0, bondLen: 0, minH: 1e9, hDelta: 0 };
                try {
                    window.__diag.generateSpec('benzene');
                    window.__diag.runOpt();
                    const ringAtoms = window.__diag.atomPositions();
                    const hBefore = ringAtoms.filter(a => a.type === 'H').length;
                    const meshes = window.__createCompleteGroup(key, p);
                    if (!meshes || !meshes.length) { out.ok = false; out.errors.push('no group returned'); return out; }
                    const gIds = new Set(meshes.map(m => m.userData._id));
                    const cross = window.__diag.bonds().filter(b => gIds.has(b.pair[0]) !== gIds.has(b.pair[1]));
                    out.crossBonds = cross.length;
                    if (cross.length !== 1) { out.ok = false; out.errors.push('crossBonds=' + cross.length); return out; }
                    out.bondLen = +cross[0].len.toFixed(3);
                    // 组内原子与环原子最小距离（允许 target 自身与锚点，即键；其余应 >= ~0.85*目标键长）
                    const ringA = window.__diag.atomPositions().filter(a => !gIds.has(a.id));
                    const target = ringA.filter(a => hashEq(a, cross[0].pair[1]))[0] || ringA.filter(a => hashEq(a, cross[0].pair[0]))[0];
                    function hashEq(a, id) { return a.id === id; }
                    for (const m of meshes) {
                        if (m === meshes[window.__GROUP_SPECS[key].anchor]) continue;
                        for (const r of ringA) {
                            const dx = m.position.x - r.x, dy = m.position.y - r.y, dz = m.position.z - r.z;
                            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                            if (dist < out.minH) out.minH = dist;
                        }
                    }
                    const hAfter = window.__diag.atomPositions().filter(a => a.type === 'H').length;
                    const gh = meshes.filter(m => m.userData.atomType === 'H').length;
                    out.hDelta = hAfter - hBefore - gh;
                    if (out.hDelta > 0) { out.ok = false; out.errors.push('hDelta=' + out.hDelta); }
                } catch (e) { out.ok = false; out.errors.push(String(e).slice(0, 200)); }
                return out;
            }, { key, p: d.p });
            report.groups[key].directions[d.name] = res;
        }

        // 键角检查:右侧放置 + runOpt 后,锚原子的键角(含与 target 的键)
        const ang = await page.evaluate(({ key }) => {
            const out = { std: -1, angles: [], hyb: '' };
            try {
                window.__diag.generateSpec('benzene');
                window.__diag.runOpt();
                const meshes = window.__createCompleteGroup(key, { x: 2.4, y: 0, z: 0 });
                window.__diag.runOpt();
                const anchor = meshes[window.__GROUP_SPECS[key].anchor];
                const d2 = window.__diag.angleDiag().filter(a => a.id === anchor.userData._id)[0];
                if (d2) { out.angles = d2.angles; out.std = d2.std; out.hyb = d2.hyb; }
            } catch (e) { out.err = String(e).slice(0, 200); }
            return out;
        }, { key });
        report.groups[key].angleCheck = ang;
    }

    // 4 号回归
    report.dir4 = await page.evaluate(async () => {
        const r = {};
        try { r.lr = typeof (window.lastRunResults) === 'string' ? window.lastRunResults : JSON.stringify(window.lastRunResults || null); } catch (e) { r.lr = 'ERR ' + e; }
        return r;
    });
    await page.evaluate(() => { try { window.__runPiSystemTests(); } catch (e) {} });
    report.state4 = await page.evaluate(() => ({
        piReport: (localStorage.getItem('PI_TEST_REPORT') || '').slice(0, 600)
    }));

    await page.goto(URL_MAIN, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(12000);
    report.reg2 = await page.evaluate(() => ({
        done: !!window.__AUTOTEST_DONE__,
        lr: (localStorage.getItem('LAST_AUTOTEST_REPORT') || '').slice(0, 1200)
    }));

    await page.goto(URL_PI, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);
    report.reg3 = await page.evaluate(() => ({
        pi: (localStorage.getItem('PI_TEST_REPORT') || '').slice(0, 1400)
    }));

    await browser.close();
    console.log(JSON.stringify(report, null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });