// 验证：基团取代氢修复 + 触屏点选放置（球棍模型4.html）
// 运行: cmd /c "node verify_group_replace_h.js > verify_group_replace_h.log 2>&1"
//
// 覆盖：
//   A 调试接口 / 屏幕空间拾取
//   B 真实鼠标把甲基拖到苯环 6 个碳（旧版 6/6 连到相邻碳）
//   C 苯环 + 甲基：恰好取代 1 个 H、C-C=1.54、无畸形键
//   D 甲烷 + 甲基 / 乙烷 + 乙基：原子数与键长
//   E 苯环 + 羟基：C-O=1.43、环 H 数不变（-1 环 H + 1 羟基 H）
//   F 环己烷（每碳仅 1 H、可直连）：不取代 H
//   G 沿 target 的 H 方向落点（旧版所有旋转角碰撞 → 无候选）
//   H 无目标远距离落点：不建畸形键（旧版 1.06/1.82 Å）
//   I 放置后无 <0.8 Å 的原子重叠
//   J 触屏：轻点基团卡 → 抽屉收起 + 提示条 + 点画布放置
//   K 触屏：点原子 = 连接/取代（恰好 -1 H）
//   L 触屏：同卡再点一次取消 / Esc 取消 / 提示条取消按钮
//   M 零 console 错误
const { chromium } = require('playwright-core');

const URL = 'http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=groupH1';

(async () => {
    const browser = await chromium.launch();
    const report = { cases: [], consoleErrors: [] };

    function check(name, pass, detail) {
        report.cases.push({ name, pass: !!pass, detail: String(detail === undefined ? '' : detail).slice(0, 600) });
        console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? ' | ' + String(detail).slice(0, 400) : ''));
    }

    // ================= 桌面 =================
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300)); });
    page.on('pageerror', e => report.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__diag && window.__setInputPanelOpen, null, { timeout: 30000 });
    await page.evaluate(() => window.__setInputPanelOpen(false));
    await page.waitForFunction(() => {
        const el = document.getElementById('input-panel');
        return el && !el.classList.contains('open') && getComputedStyle(el).visibility === 'hidden';
    }, null, { timeout: 5000 });
    await page.waitForTimeout(300);

    // ---------- A. 接口 ----------
    const api = await page.evaluate(() => ({
        pick: typeof window.__pickAtomAtScreen,
        free: typeof window.__bestFreeDirectionFor,
        place: typeof window.__groupPlace,
        banner: !!document.getElementById('place-banner'),
        bannerCancel: !!document.getElementById('place-banner-cancel')
    }));
    check('A1 屏幕拾取/方向回退/点选放置接口就绪',
        api.pick === 'function' && api.free === 'function' && api.place === 'object' && api.banner && api.bannerCancel,
        JSON.stringify(api));

    // 屏幕拾取正确性：苯环 6 个碳，指针点各自投影点必须命中该碳
    const pickOk = await page.evaluate(() => {
        window.__diag.generateSpec('benzene');
        const cs = window.__dragMode.atoms().filter(a => a.t === 'C');
        return cs.map((c, i) => {
            const p = window.__dragMode.project(c.p[0], c.p[1], c.p[2]);
            const m = window.__pickAtomAtScreen(p.x, p.y);
            if (!m) return false;
            return Math.hypot(m.position.x - c.p[0], m.position.y - c.p[1], m.position.z - c.p[2]) < 0.05;
        });
    });
    check('A2 屏幕拾取：苯环 6 个碳各自命中', pickOk.every(Boolean), JSON.stringify(pickOk));

    // ---------- B. 真实鼠标：甲基拖到苯环每个碳 ----------
    const mouseResults = [];
    for (let ci = 0; ci < 6; ci++) {
        await page.evaluate(() => { window.__diag.generateSpec('benzene'); window.__lastGroupPlacement = null; });
        await page.waitForTimeout(110);
        const info = await page.evaluate((ci) => {
            const cs = window.__dragMode.atoms().filter(a => a.t === 'C');
            const p = window.__dragMode.project(cs[ci].p[0], cs[ci].p[1], cs[ci].p[2]);
            const card = document.querySelector('.group-card[data-group="methyl"]');
            const r = card.getBoundingClientRect();
            return { p, card: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, pos: cs[ci].p };
        }, ci);
        await page.mouse.move(info.card.x, info.card.y);
        await page.mouse.down();
        await page.mouse.move(info.p.x, info.p.y, { steps: 12 });
        await page.mouse.up();
        await page.waitForTimeout(140);
        const got = await page.evaluate(() => {
            const lp = window.__lastGroupPlacement;
            if (!lp) return { none: true };
            return {
                mode: lp.mode, replaced: !!lp.replacedH, explicit: lp.explicit,
                targetPos: lp.target ? [lp.target.position.x, lp.target.position.y, lp.target.position.z] : null,
                atoms: window.__dragMode.atoms().length,
                bonds: window.__diag.bonds()
            };
        });
        const d = got.targetPos
            ? Math.hypot(got.targetPos[0] - info.pos[0], got.targetPos[1] - info.pos[1], got.targetPos[2] - info.pos[2])
            : null;
        mouseResults.push({
            ci, mode: got.mode, replaced: got.replaced, explicit: got.explicit,
            dist: d === null ? null : +d.toFixed(2), atoms: got.atoms,
            bad: got.bonds ? got.bonds.filter(b => Math.abs(b.len - b.target) > 0.12).length : -1
        });
    }
    const bOk = mouseResults.every(r => r.dist !== null && r.dist < 0.05 && r.mode === 'replace' && r.replaced && r.atoms === 15 && r.bad === 0);
    check('B1 真实鼠标：苯环 6 个碳落点全部正确（旧版 6/6 连到相邻碳）', bOk,
        JSON.stringify(mouseResults));

    // ---------- C. 苯环 + 甲基（显式目标） ----------
    const cRes = await page.evaluate(async () => {
        window.__diag.generateSpec('benzene');
        await new Promise(r => setTimeout(r, 60));
        const before = window.__dragMode.atoms();
        const c = before.filter(a => a.t === 'C')[2];
        const p = window.__dragMode.project(c.p[0], c.p[1], c.p[2]);
        const mesh = window.__pickAtomAtScreen(p.x, p.y);
        window.__createCompleteGroup('methyl', { x: c.p[0] + 0.2, y: c.p[1] + 0.5, z: c.p[2] + 0.9 },
            { target: mesh, clientX: p.x, clientY: p.y });
        const atoms = window.__dragMode.atoms();
        const bs = window.__diag.bonds();
        const lp = window.__lastGroupPlacement;
        return {
            beforeN: before.length, beforeH: before.filter(a => a.t === 'H').length,
            afterN: atoms.length, afterH: atoms.filter(a => a.t === 'H').length,
            mode: lp.mode, replaced: !!lp.replacedH, explicit: lp.explicit,
            cc: bs.filter(b => b.types[0] === 'C' && b.types[1] === 'C' && b.type === 1).map(b => b.len),
            bad: bs.filter(b => Math.abs(b.len - b.target) > 0.12).length
        };
    });
    check('C1 苯环+甲基：恰好 1 个 H 被取代、15 原子、C-C=1.54、无畸形键',
        cRes.afterN === 15 && cRes.beforeH === 6 && cRes.afterH === 8 &&
        cRes.mode === 'replace' && cRes.replaced && cRes.explicit &&
        cRes.cc.length === 1 && Math.abs(cRes.cc[0] - 1.54) < 0.02 && cRes.bad === 0,
        JSON.stringify(cRes));

    // ---------- D. 甲烷 + 甲基 / 乙烷 + 乙基 ----------
    const dRes = await page.evaluate(async () => {
        const out = {};
        window.__diag.generateSpec('methane');
        await new Promise(r => setTimeout(r, 50));
        let c = window.__dragMode.atoms().find(a => a.t === 'C');
        let p = window.__dragMode.project(c.p[0], c.p[1], c.p[2]);
        window.__createCompleteGroup('methyl', { x: c.p[0] + 0.3, y: c.p[1] + 0.9, z: c.p[2] + 0.3 },
            { target: window.__pickAtomAtScreen(p.x, p.y), clientX: p.x, clientY: p.y });
        let bs = window.__diag.bonds();
        out.methane = {
            n: window.__dragMode.atoms().length,
            mode: window.__lastGroupPlacement.mode, replaced: !!window.__lastGroupPlacement.replacedH,
            cc: bs.filter(b => b.types[0] === 'C' && b.types[1] === 'C').map(b => b.len),
            bad: bs.filter(b => Math.abs(b.len - b.target) > 0.12).length
        };
        window.__diag.generateSpec('ethane');
        await new Promise(r => setTimeout(r, 50));
        c = window.__dragMode.atoms().filter(a => a.t === 'C')[0];
        p = window.__dragMode.project(c.p[0], c.p[1], c.p[2]);
        window.__createCompleteGroup('ethyl', { x: c.p[0] + 0.4, y: c.p[1] + 1.1, z: c.p[2] + 0.2 },
            { target: window.__pickAtomAtScreen(p.x, p.y), clientX: p.x, clientY: p.y });
        bs = window.__diag.bonds();
        out.ethane = {
            n: window.__dragMode.atoms().length,
            mode: window.__lastGroupPlacement.mode, replaced: !!window.__lastGroupPlacement.replacedH,
            maxLen: Math.max(...bs.map(b => b.len)),
            bad: bs.filter(b => Math.abs(b.len - b.target) > 0.12).length
        };
        return out;
    });
    check('D1 甲烷+甲基：8 原子、C-C=1.54、取代 1 H',
        dRes.methane.n === 8 && dRes.methane.mode === 'replace' && dRes.methane.replaced &&
        dRes.methane.cc.length === 1 && Math.abs(dRes.methane.cc[0] - 1.54) < 0.02 && dRes.methane.bad === 0,
        JSON.stringify(dRes.methane));
    check('D2 乙烷+乙基：14 原子、全部键长正确',
        dRes.ethane.n === 14 && dRes.ethane.replaced && dRes.ethane.bad === 0 && dRes.ethane.maxLen <= 1.55,
        JSON.stringify(dRes.ethane));

    // ---------- E. 苯环 + 羟基 ----------
    const eRes = await page.evaluate(async () => {
        window.__diag.generateSpec('benzene');
        await new Promise(r => setTimeout(r, 60));
        const c = window.__dragMode.atoms().filter(a => a.t === 'C')[0];
        const p = window.__dragMode.project(c.p[0], c.p[1], c.p[2]);
        window.__createCompleteGroup('hydroxyl', { x: c.p[0], y: c.p[1] + 0.3, z: c.p[2] + 0.8 },
            { target: window.__pickAtomAtScreen(p.x, p.y), clientX: p.x, clientY: p.y });
        const atoms = window.__dragMode.atoms();
        const bs = window.__diag.bonds();
        return {
            n: atoms.length, h: atoms.filter(a => a.t === 'H').length,
            mode: window.__lastGroupPlacement.mode, replaced: !!window.__lastGroupPlacement.replacedH,
            co: bs.filter(b => (b.types[0] === 'C' && b.types[1] === 'O') || (b.types[0] === 'O' && b.types[1] === 'C')).map(b => b.len),
            bad: bs.filter(b => Math.abs(b.len - b.target) > 0.12).length
        };
    });
    check('E1 苯环+羟基：13 原子、6 H（-1 环 H +1 羟基 H）、C-O=1.43',
        eRes.n === 13 && eRes.h === 6 && eRes.mode === 'replace' && eRes.replaced &&
        eRes.co.length === 1 && Math.abs(eRes.co[0] - 1.43) < 0.02 && eRes.bad === 0,
        JSON.stringify(eRes));

    // ---------- F. 环己烷（每碳 1 H，可直连）：不取代 H ----------
    const fRes = await page.evaluate(async () => {
        window.__diag.generateSpec('cyclohexane');
        await new Promise(r => setTimeout(r, 60));
        const before = window.__dragMode.atoms();
        const c = before.find(a => a.t === 'C');
        const p = window.__dragMode.project(c.p[0], c.p[1], c.p[2]);
        window.__createCompleteGroup('methyl', { x: c.p[0] + 0.3, y: c.p[1] + 0.9, z: c.p[2] + 0.3 },
            { target: window.__pickAtomAtScreen(p.x, p.y), clientX: p.x, clientY: p.y });
        const atoms = window.__dragMode.atoms();
        const bs = window.__diag.bonds();
        return {
            beforeN: before.length, beforeH: before.filter(a => a.t === 'H').length,
            afterN: atoms.length, afterH: atoms.filter(a => a.t === 'H').length,
            mode: window.__lastGroupPlacement.mode, replaced: !!window.__lastGroupPlacement.replacedH,
            bad: bs.filter(b => Math.abs(b.len - b.target) > 0.12).length,
            maxLen: Math.max(...bs.map(b => b.len))
        };
    });
    check('F1 环己烷+甲基（未饱和中心）：直连、H 不被取代、无畸形键',
        fRes.mode === 'direct' && fRes.replaced === false && fRes.afterN === 16 &&
        fRes.afterH === fRes.beforeH + 3 && fRes.bad === 0 && fRes.maxLen <= 1.55,
        JSON.stringify(fRes));

    // ---------- G. 沿 target 的 H 方向落点（方向被挡） ----------
    const gRes = await page.evaluate(async () => {
        window.__diag.generateSpec('cyclohexane');
        await new Promise(r => setTimeout(r, 60));
        const atoms = window.__dragMode.atoms();
        const c = atoms.find(a => a.t === 'C');
        const h = atoms.filter(a => a.t === 'H')
            .map(a => ({ a, d: Math.hypot(a.p[0] - c.p[0], a.p[1] - c.p[1], a.p[2] - c.p[2]) }))
            .filter(o => Math.abs(o.d - 1.09) < 0.12)
            .sort((x, y) => x.d - y.d)[0];
        const v = [h.a.p[0] - c.p[0], h.a.p[1] - c.p[1], h.a.p[2] - c.p[2]];
        const L = Math.hypot(...v);
        const drop = { x: c.p[0] + v[0] / L * 0.95, y: c.p[1] + v[1] / L * 0.95, z: c.p[2] + v[2] / L * 0.95 };
        const p = window.__dragMode.project(drop.x, drop.y, drop.z);
        window.__createCompleteGroup('methyl', drop, { target: window.__pickAtomAtScreen(p.x, p.y), clientX: p.x, clientY: p.y });
        const bs = window.__diag.bonds();
        return {
            mode: window.__lastGroupPlacement.mode, replaced: !!window.__lastGroupPlacement.replacedH,
            fallback: window.__lastGroupPlacement.freeFallback,
            atoms: window.__dragMode.atoms().length,
            bad: bs.filter(b => Math.abs(b.len - b.target) > 0.12).length,
            maxLen: Math.max(...bs.map(b => b.len))
        };
    });
    check('G1 落点方向被 target 的 H 挡住：仍能成键且键长正确',
        gRes.atoms === 16 && gRes.bad === 0 && gRes.maxLen <= 1.55,
        JSON.stringify(gRes));

    // ---------- H. 无目标远距离落点：不建畸形键 ----------
    const hRes = await page.evaluate(async () => {
        window.__diag.generateSpec('benzene');
        await new Promise(r => setTimeout(r, 60));
        const before = window.__dragMode.atoms().length;
        window.__createCompleteGroup('methyl', { x: 6, y: 3, z: 4 });
        const bs = window.__diag.bonds();
        return {
            before, after: window.__dragMode.atoms().length,
            fallback: window.__lastGroupPlacement.freeFallback,
            target: !!window.__lastGroupPlacement.target,
            bad: bs.filter(b => Math.abs(b.len - b.target) > 0.12).length,
            maxLen: Math.max(...bs.map(b => b.len))
        };
    });
    check('H1 无目标远距离落点：不建键（旧版 1.06/1.82 Å 畸形键）',
        hRes.after === hRes.before + 4 && hRes.fallback === true && hRes.target === false &&
        hRes.bad === 0 && hRes.maxLen <= 1.41,
        JSON.stringify(hRes));

    // ---------- I. 放置后无原子重叠 ----------
    const iRes = await page.evaluate(async () => {
        const cases = [
            { spec: 'benzene', group: 'methyl', idx: 0 },
            { spec: 'benzene', group: 'phenyl', idx: 1 },
            { spec: 'methane', group: 'ethyl', idx: 0 },
            { spec: 'cyclohexane', group: 'carboxyl', idx: 0 },
            { spec: 'ethane', group: 'amino', idx: 0 }
        ];
        const out = [];
        for (const cs of cases) {
            window.__diag.generateSpec(cs.spec);
            await new Promise(r => setTimeout(r, 60));
            const c = window.__dragMode.atoms().filter(a => a.t !== 'H')[cs.idx];
            const p = window.__dragMode.project(c.p[0], c.p[1], c.p[2]);
            window.__createCompleteGroup(cs.group, { x: c.p[0] + 0.3, y: c.p[1] + 0.9, z: c.p[2] + 0.4 },
                { target: window.__pickAtomAtScreen(p.x, p.y), clientX: p.x, clientY: p.y });
            const atoms = window.__dragMode.atoms();
            const bs = window.__diag.bonds();
            const bonded = new Set(bs.map(x => x.pair.slice().sort((a, b) => a - b).join('-')));
            let minPair = Infinity;
            for (let i = 0; i < atoms.length; i++) {
                for (let j = i + 1; j < atoms.length; j++) {
                    if (bonded.has([atoms[i].id, atoms[j].id].sort((a, b) => a - b).join('-'))) continue;
                    const d = Math.hypot(atoms[i].p[0] - atoms[j].p[0], atoms[i].p[1] - atoms[j].p[1], atoms[i].p[2] - atoms[j].p[2]);
                    if (d < minPair) minPair = d;
                }
            }
            out.push({
                case: cs.spec + '+' + cs.group, n: atoms.length,
                minPair: +minPair.toFixed(3),
                bad: bs.filter(b => Math.abs(b.len - b.target) > 0.12).length
            });
        }
        return out;
    });
    check('I1 五种组合放置后无 <0.8 Å 原子重叠、无畸形键',
        iRes.every(r => r.minPair >= 0.8 && r.bad === 0), JSON.stringify(iRes));

    await page.close();

    // ================= 手机（触屏） =================
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2
    });
    const mp = await ctx.newPage();
    mp.on('console', m => { if (m.type() === 'error') report.consoleErrors.push('[mobile] ' + m.text().slice(0, 300)); });
    mp.on('pageerror', e => report.consoleErrors.push('[mobile] PAGEERROR: ' + String(e).slice(0, 300)));
    await mp.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await mp.waitForFunction(() => window.__diag && window.__groupPlace, null, { timeout: 30000 });
    await mp.evaluate(() => { window.__setInputPanelOpen(false); window.__diag.generateSpec('methane'); });
    await mp.waitForTimeout(250);

    const cdp = await ctx.newCDPSession(mp);
    const tap = async (x, y) => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await mp.waitForTimeout(40);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await mp.waitForTimeout(150);
    };
    const openBuild = async () => {
        await mp.click('#mb-build');
        await mp.waitForTimeout(320);
    };
    const cardCenter = () => mp.evaluate(() => {
        const r = document.querySelector('.group-card[data-group="methyl"]').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const placeState = () => mp.evaluate(() => ({
        active: window.__groupPlace.active(),
        state: window.__groupPlace.state(),
        banner: document.getElementById('place-banner').classList.contains('show'),
        text: document.getElementById('place-banner-text').textContent,
        drawer: document.getElementById('build-panel').classList.contains('sheet-open'),
        hidden: getComputedStyle(document.getElementById('build-panel')).visibility,
        atoms: window.__dragMode.atoms().length
    }));

    // ---------- J. 轻点基团卡 → 点选放置模式 ----------
    await openBuild();
    const card = await cardCenter();
    await tap(card.x, card.y);
    await mp.waitForTimeout(350);
    const jState = await placeState();
    check('J1 轻点基团卡：进入点选放置、抽屉收起、提示条显示基团名',
        jState.active === true && jState.state && jState.state.kind === 'group' && jState.state.key === 'methyl' &&
        jState.banner === true && jState.text.includes('CH₃') && jState.drawer === false && jState.atoms === 5,
        JSON.stringify(jState));

    // ---------- K. 点画布放置 ----------
    // 点画布左上方空白处（离分子 > 触摸拾取半径 64px），确保是"落点放置"而非取代
    const spot = await mp.evaluate(() => {
        const r = document.querySelector('canvas[data-engine]').getBoundingClientRect();
        return { x: r.left + r.width * 0.18, y: r.top + r.height * 0.3 };
    });
    await tap(spot.x, spot.y);
    await mp.waitForTimeout(300);
    const kState = await placeState();
    const kPlace = await mp.evaluate(() => ({
        mode: window.__lastGroupPlacement ? window.__lastGroupPlacement.mode : null,
        fallback: window.__lastGroupPlacement ? window.__lastGroupPlacement.freeFallback : null,
        bad: window.__diag.bonds().filter(b => Math.abs(b.len - b.target) > 0.12).length
    }));
    check('K1 点画布：甲基落位（原子数 5→9）且退出放置模式',
        kState.atoms === 9 && kState.active === false && kState.banner === false && kPlace.bad === 0,
        JSON.stringify(kState) + ' ' + JSON.stringify(kPlace));

    // ---------- K2. 点原子 = 连接/取代 ----------
    await openBuild();
    await tap(card.x, card.y);
    await mp.waitForTimeout(300);
    const atomPt = await mp.evaluate(() => {
        const a = window.__dragMode.atoms().find(x => x.t === 'C');
        return window.__dragMode.project(a.p[0], a.p[1], a.p[2]);
    });
    await tap(atomPt.x, atomPt.y);
    await mp.waitForTimeout(320);
    const k2 = await mp.evaluate(() => {
        const lp = window.__lastGroupPlacement;
        const atoms = window.__dragMode.atoms();
        const bs = window.__diag.bonds();
        return {
            atoms: atoms.length, h: atoms.filter(a => a.t === 'H').length,
            mode: lp ? lp.mode : null, replaced: lp ? !!lp.replacedH : null,
            placing: window.__groupPlace.active(),
            bad: bs.filter(b => Math.abs(b.len - b.target) > 0.12).length,
            cc: bs.filter(b => b.types[0] === 'C' && b.types[1] === 'C').map(b => b.len)
        };
    });
    check('K2 触屏点原子：连接并恰好取代 1 个 H（9→12 原子、C-C=1.54）',
        k2.atoms === 12 && k2.mode === 'replace' && k2.replaced === true && k2.placing === false &&
        k2.bad === 0 && k2.cc.some(v => Math.abs(v - 1.54) < 0.02),
        JSON.stringify(k2));

    // ---------- L1. 同一张卡再点一次取消 ----------
    await openBuild();
    await tap(card.x, card.y);
    await mp.waitForTimeout(300);
    const l1a = await placeState();
    await openBuild();
    await tap(card.x, card.y);
    await mp.waitForTimeout(300);
    const l1b = await placeState();
    check('L1 同一张卡再点一次 = 取消放置',
        l1a.active === true && l1b.active === false && l1b.banner === false,
        JSON.stringify({ a: l1a.active, b: l1b.active }));

    // ---------- L2. Esc 取消 ----------
    await openBuild();
    await tap(card.x, card.y);
    await mp.waitForTimeout(300);
    await mp.keyboard.press('Escape');
    await mp.waitForTimeout(250);
    const l2 = await placeState();
    check('L2 Esc 取消点选放置（不连带关抽屉）',
        l2.active === false && l2.banner === false, JSON.stringify(l2));

    // ---------- L3. 提示条取消按钮 ----------
    await openBuild();
    await tap(card.x, card.y);
    await mp.waitForTimeout(300);
    await mp.click('#place-banner-cancel');
    await mp.waitForTimeout(250);
    const l3 = await placeState();
    check('L3 提示条「取消」按钮退出放置模式',
        l3.active === false && l3.banner === false, JSON.stringify(l3));

    // ---------- L4. 触摸拖动基团仍可放置（抽屉自动收起） ----------
    await mp.evaluate(() => { window.__diag.generateSpec('methane'); });
    await mp.waitForTimeout(200);
    await openBuild();
    const card2 = await cardCenter();
    const before = await mp.evaluate(() => window.__dragMode.atoms().length);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: card2.x, y: card2.y }] });
    const dragTo = { x: 70, y: 300 };
    for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{
                x: card2.x + (dragTo.x - card2.x) * i / 10,
                y: card2.y + (dragTo.y - card2.y) * i / 10
            }]
        });
        await mp.waitForTimeout(25);
    }
    const midDrag = await mp.evaluate(() => ({
        dragging: window.__groupPlace.active() === false,
        drawerVisible: getComputedStyle(document.getElementById('build-panel')).visibility
    }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await mp.waitForTimeout(400);
    const l4 = await mp.evaluate(() => ({
        atoms: window.__dragMode.atoms().length,
        lp: window.__lastGroupPlacement ? window.__lastGroupPlacement.mode : null,
        drawerVis: getComputedStyle(document.getElementById('build-panel')).visibility,
        drawerOpen: document.getElementById('build-panel').classList.contains('sheet-open')
    }));
    check('L4 触屏拖动基团：抽屉自动收起、松手完成放置',
        l4.atoms === before + 4 && l4.drawerOpen === false,
        JSON.stringify({ before, midDrag, after: l4 }));

    // ---------- L5. 触屏点选放置：原子卡 ----------
    await mp.evaluate(() => { window.__diag.generateSpec('methane'); window.__buildLib.set('atoms'); });
    await mp.waitForTimeout(200);
    await openBuild();
    const atomCard = await mp.evaluate(() => {
        const r = document.getElementById('drag-carbon').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const nBefore = await mp.evaluate(() => window.__dragMode.atoms().length);
    await tap(atomCard.x, atomCard.y);
    await mp.waitForTimeout(300);
    const l5a = await placeState();
    const spot2 = await mp.evaluate(() => {
        const r = document.querySelector('canvas[data-engine]').getBoundingClientRect();
        return { x: r.left + r.width * 0.8, y: r.top + r.height * 0.3 };
    });
    await tap(spot2.x, spot2.y);
    await mp.waitForTimeout(300);
    const l5b = await mp.evaluate(() => ({
        atoms: window.__dragMode.atoms().length,
        placing: window.__groupPlace.active()
    }));
    check('L5 触屏点选放置原子卡：提示「碳」+ 点画布新增 1 个原子',
        l5a.active === true && l5a.state && l5a.state.kind === 'atom' && l5a.text.includes('碳') &&
        l5b.atoms === nBefore + 1 && l5b.placing === false,
        JSON.stringify({ a: l5a, b: l5b, nBefore }));

    // ---------- M. 零 console 错误 ----------
    check('M1 零 console 错误', report.consoleErrors.length === 0, report.consoleErrors.join(' | '));

    const pass = report.cases.filter(c => c.pass).length;
    report.summary = { pass, total: report.cases.length };
    console.log(`\nSUMMARY ${pass}/${report.cases.length}`);
    await browser.close();
    process.exit(pass === report.cases.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
