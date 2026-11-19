// 验证：一键优化保持手性碳构型（球棍模型4.html）
// 运行: cmd /c "node verify_chirality.js > verify_chirality.log 2>&1"
//
// 背景（2026-11）：手搭的非理想四面体 / 环上手性中心经「一键优化」后
// 构型镜像翻转（R↔S）。根因两处：
//   1) getIdealDirections() 贪心「取 dot 最大的槽」会交换两个非锚定邻居（奇置换）；
//   2) 环上 sp3 中心的角度阶段固定 outers[0]→+法线、outers[1]→-法线，
//      与扰动前侧别无关。
// 修复后本脚本覆盖：
//   C1  __chirality 诊断接口 + 与本地有符号体积口径一致
//   C2  完美四面体 C*(H)(F)(Cl)(Br) 不扰动：优化后同手性、键角 109.5°
//   C3  完美四面体 + 扰动（6 seeds）：同手性且收敛
//   C4  随机非理想四取代中心（24 seeds）：同手性且收敛（修复前 46/200 翻转）
//   C5  相邻双手性中心（12 seeds）：两个中心都同手性
//   C6  1,2-二甲基环丙烷环上手性中心（10 seeds + 扰动）：同手性、环不散
//   C7  顶栏「优化」真实点击（公共入口 optimizeAllWithAutoHydrogen）
//   C8  2-丁醇 SMILES 生成 → 扰动 → 优化：C2 手性保持
//   C9  __chirality.all()/sign() 与 of() 一致
//   C10 33 例几何自测全过
//   C11 零 console / pageerror
const { chromium } = require('playwright-core');

const URL = 'http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=chirality1';

(async () => {
  const started = Date.now();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const results = [];
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 240)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 240)); });

  const t = (name, cond, extra) => {
    const line = (cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '');
    results.push({ name, pass: !!cond, extra });
    console.log(line);
  };

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => window.__diag && typeof window.__diag.runOpt === 'function' && window.__chirality,
    null, { timeout: 60000 });
  await page.waitForTimeout(600);
  // webdriver 下生成抽屉默认展开，会盖住顶栏右侧按钮
  await page.evaluate(() => window.__setInputPanelOpen(false));
  await page.waitForFunction(() => window.__ddAnim && window.__ddAnim.idle(), null, { timeout: 8000 }).catch(() => {});

  // ---------- 页面内测试工具（挂 window.__chirTest，供后续 evaluate 复用） ----------
  await page.evaluate(() => {
    const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
    const len = a => Math.hypot(a.x, a.y, a.z);
    const norm = a => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
    const det3 = (a, b, c) => a.x * (b.y * c.z - b.z * c.y)
      - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x);
    const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b))))) * 180 / Math.PI;

    function rng(seed) {
      let x = (seed * 2654435761) % 4294967296;
      return () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
    }
    function randomDirs(r, count, minAngle) {
      const dirs = [];
      let guard = 0;
      while (dirs.length < count && guard++ < 20000) {
        const u = r() * 2 - 1, th = r() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        const d = { x: s * Math.cos(th), y: s * Math.sin(th), z: u };
        let ok = true;
        for (const e of dirs) if (angle(d, e) < minAngle) { ok = false; break; }
        if (ok) dirs.push(d);
      }
      return dirs.length === count ? dirs : null;
    }
    const clearCanvas = () => document.getElementById('btn-clear-molecule').click();

    // 与产品 __chirality 同口径：邻居按 id 升序、单位方向有符号体积
    function chirLocal(id) {
      const atoms = {};
      for (const a of window.__diag.atomPositions()) atoms[a.id] = a;
      const c = atoms[id];
      if (!c) return { ok: false, err: 'center missing' };
      const nbs = [];
      for (const b of window.__diag.bonds()) {
        let o = null;
        if (b.pair[0] === id) o = b.pair[1];
        else if (b.pair[1] === id) o = b.pair[0];
        if (o != null) nbs.push(o);
      }
      nbs.sort((a, b) => a - b);
      if (nbs.length !== 4) return { ok: false, err: 'need 4, got ' + nbs.length };
      const v = nbs.map(i => sub(atoms[i], c));
      const u = v.map(norm);
      const du = det3(sub(u[0], u[3]), sub(u[1], u[3]), sub(u[2], u[3]));
      const angles = [];
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) angles.push(+angle(v[i], v[j]).toFixed(1));
      return {
        ok: true, id, ids: nbs, types: nbs.map(i => atoms[i].type),
        det: +du.toFixed(4), sign: du > 0 ? 1 : (du < 0 ? -1 : 0),
        angles: angles.sort((a, b) => a - b)
      };
    }

    function buildCStar(seed, minAngle, offset) {
      const r = rng(seed);
      let dirs = null;
      for (let tries = 0; tries < 500 && !dirs; tries++) dirs = randomDirs(r, 4, minAngle || 72);
      if (!dirs) return null;
      clearCanvas();
      const types = ['H', 'F', 'Cl', 'Br'];
      const lens = [1.09, 1.35, 1.75, 1.95];
      const c = window.__createHeavyAtom('C', offset || { x: 0, y: 0, z: 0 });
      for (let i = 0; i < 4; i++) {
        const a = window.__createHeavyAtom(types[i], {
          x: (offset ? offset.x : 0) + dirs[i].x * lens[i],
          y: (offset ? offset.y : 0) + dirs[i].y * lens[i],
          z: (offset ? offset.z : 0) + dirs[i].z * lens[i]
        });
        window.__manualBond(c, a, 1);
      }
      window.__diag.updateBonds();
      return c.userData._id;
    }

    // 完美四面体：四个方向两两 109.47°
    function buildPerfectTetra(offset) {
      clearCanvas();
      const o = offset || { x: 0, y: 0, z: 0 };
      const dirs = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(d => norm({ x: d[0], y: d[1], z: d[2] }));
      const types = ['H', 'F', 'Cl', 'Br'];
      const lens = [1.09, 1.35, 1.75, 1.95];
      const c = window.__createHeavyAtom('C', o);
      for (let i = 0; i < 4; i++) {
        const a = window.__createHeavyAtom(types[i], {
          x: o.x + dirs[i].x * lens[i], y: o.y + dirs[i].y * lens[i], z: o.z + dirs[i].z * lens[i]
        });
        window.__manualBond(c, a, 1);
      }
      window.__diag.updateBonds();
      return c.userData._id;
    }

    function buildTwoCenters(seed, offset) {
      const r = rng(seed);
      clearCanvas();
      const o = offset || { x: 0, y: 0, z: 0 };
      const c1 = window.__createHeavyAtom('C', o);
      const c2 = window.__createHeavyAtom('C', { x: o.x + 1.54, y: o.y + 0.2, z: o.z + 0.1 });
      window.__manualBond(c1, c2, 1);
      const add = (center, types, lens, seed2) => {
        const rr = rng(seed2);
        let dirs = null;
        for (let k = 0; k < 500 && !dirs; k++) dirs = randomDirs(rr, 3, 72);
        if (!dirs) return false;
        for (let i = 0; i < 3; i++) {
          const a = window.__createHeavyAtom(types[i], {
            x: center.position.x + dirs[i].x * lens[i],
            y: center.position.y + dirs[i].y * lens[i],
            z: center.position.z + dirs[i].z * lens[i]
          });
          window.__manualBond(center, a, 1);
        }
        return true;
      };
      add(c1, ['H', 'F', 'Cl'], [1.09, 1.35, 1.75], seed * 7 + 1);
      add(c2, ['H', 'F', 'Br'], [1.09, 1.35, 1.95], seed * 7 + 3);
      window.__diag.updateBonds();
      return [c1.userData._id, c2.userData._id];
    }

    // 1,2-二甲基环丙烷：C0/C1 各带 CH3，其余补 H（环上 sp3 手性中心）
    function buildDimethylCyclopropane(offset) {
      clearCanvas();
      const o = offset || { x: 0, y: 0, z: 0 };
      const p = (x, y, z) => ({ x: o.x + x, y: o.y + y, z: o.z + z });
      const c0 = window.__createHeavyAtom('C', p(0, 0.77, 0));
      const c1 = window.__createHeavyAtom('C', p(-0.89, -0.39, 0.1));
      const c2 = window.__createHeavyAtom('C', p(0.89, -0.39, -0.1));
      window.__manualBond(c0, c1, 1); window.__manualBond(c1, c2, 1); window.__manualBond(c2, c0, 1);
      const m0 = window.__createHeavyAtom('C', p(0.1, 1.7, 1.1));
      const m1 = window.__createHeavyAtom('C', p(-1.7, -0.9, 1.2));
      window.__manualBond(c0, m0, 1); window.__manualBond(c1, m1, 1);
      window.__diag.updateBonds();
      window.__addMissingHydrogens();
      window.__diag.updateBonds();
      return [c0.userData._id, c1.userData._id];
    }

    window.__chirTest = {
      rng, randomDirs, clearCanvas, chirLocal,
      buildCStar, buildPerfectTetra, buildTwoCenters, buildDimethylCyclopropane
    };
  });

  // ---------- C1 诊断接口 ----------
  const c1 = await page.evaluate(() => {
    const id = window.__chirTest.buildCStar(11, 72);
    const of = window.__chirality.of(id);
    const loc = window.__chirTest.chirLocal(id);
    const all = window.__chirality.all(0.05);
    const sign = window.__chirality.sign(id);
    return {
      api: typeof window.__chirality.of === 'function' && typeof window.__chirality.all === 'function'
        && typeof window.__chirality.sign === 'function',
      ofOk: of.ok, ofSign: of.sign, locSign: loc.sign, same: of.sign === loc.sign,
      allHas: all.some(r => r.id === id), sign,
      types: of.types, angles: of.angles
    };
  });
  t('C1 __chirality 接口就绪且与本地口径一致',
    c1.api && c1.ofOk && c1.same && c1.allHas && c1.sign === c1.ofSign,
    JSON.stringify(c1));

  // ---------- C2 完美四面体不扰动 ----------
  const c2 = await page.evaluate(() => {
    const id = window.__chirTest.buildPerfectTetra();
    const before = window.__chirTest.chirLocal(id);
    window.__diag.runOpt();
    const after = window.__chirTest.chirLocal(id);
    return { before, after };
  });
  t('C2 完美四面体优化后同手性 + 109.5°',
    c2.before.ok && c2.after.ok && c2.before.sign === c2.after.sign
      && c2.after.angles.every(a => Math.abs(a - 109.47) < 0.5),
    JSON.stringify({ b: c2.before.sign, a: c2.after.sign, ang: c2.after.angles }));

  // ---------- C3 完美四面体 + 扰动 ----------
  const c3 = await page.evaluate(() => {
    const orig = Math.random;
    const rows = [];
    for (let seed = 1; seed <= 6; seed++) {
      const id = window.__chirTest.buildPerfectTetra();
      const before = window.__chirTest.chirLocal(id);
      Math.random = window.__chirTest.rng(seed);
      window.__diag.perturb(0.45);
      window.__diag.runOpt();
      const after = window.__chirTest.chirLocal(id);
      rows.push({ seed, b: before.sign, a: after.sign, flip: before.sign !== after.sign, angles: after.angles });
    }
    Math.random = orig;
    return { flips: rows.filter(r => r.flip).length, rows };
  });
  t('C3 完美四面体 + 扰动 6 seeds 同手性',
    c3.flips === 0 && c3.rows.every(r => r.angles.every(a => a > 95 && a < 125)),
    JSON.stringify({ flips: c3.flips }));

  // ---------- C4 随机非理想四取代中心 ----------
  const c4 = await page.evaluate(() => {
    const rows = [];
    for (let seed = 1; seed <= 24; seed++) {
      const id = window.__chirTest.buildCStar(seed, 72);
      if (id == null) { rows.push({ seed, err: 'build fail' }); continue; }
      const before = window.__chirTest.chirLocal(id);
      if (!before.ok) { rows.push({ seed, err: before.err }); continue; }
      window.__diag.runOpt();
      const after = window.__chirTest.chirLocal(id);
      if (!after.ok) { rows.push({ seed, err: after.err }); continue; }
      rows.push({
        seed, b: before.sign, a: after.sign,
        flip: before.sign !== after.sign,
        converged: after.angles.every(a => a > 95 && a < 125),
        angles: after.angles
      });
    }
    return {
      flips: rows.filter(r => r.flip).length,
      bad: rows.filter(r => !r.converged).map(r => ({ seed: r.seed, angles: r.angles })),
      rows: rows.length
    };
  });
  t('C4 随机非理想四取代中心 24 seeds 同手性且收敛',
    c4.flips === 0 && c4.bad.length === 0, JSON.stringify(c4));

  // ---------- C5 相邻双手性中心 ----------
  const c5 = await page.evaluate(() => {
    const rows = [];
    for (let seed = 1; seed <= 12; seed++) {
      const ids = window.__chirTest.buildTwoCenters(seed);
      if (!ids) { rows.push({ seed, err: 'build fail' }); continue; }
      const before = ids.map(id => window.__chirTest.chirLocal(id));
      if (before.some(b => !b.ok)) { rows.push({ seed, err: before.map(b => b.err) }); continue; }
      window.__diag.runOpt();
      const after = ids.map(id => window.__chirTest.chirLocal(id));
      rows.push({
        seed,
        b: before.map(x => x.sign), a: after.map(x => x.sign),
        flip: before.map((x, i) => after[i].ok && x.sign !== after[i].sign),
        converged: after.every(x => x.ok && x.angles.every(a => a > 95 && a < 125))
      });
    }
    return {
      flips: rows.filter(r => r.flip && r.flip.some(Boolean)).length,
      bad: rows.filter(r => !r.converged).map(r => r.seed),
      rows: rows.length
    };
  });
  t('C5 相邻双手性中心 12 seeds 同手性',
    c5.flips === 0 && c5.bad.length === 0, JSON.stringify(c5));

  // ---------- C6 环上手性中心（扰动） ----------
  const c6 = await page.evaluate(() => {
    const orig = Math.random;
    const rows = [];
    for (let seed = 1; seed <= 10; seed++) {
      const ids = window.__chirTest.buildDimethylCyclopropane();
      const before = ids.map(id => window.__chirTest.chirLocal(id));
      if (before.some(b => !b.ok)) { rows.push({ seed, err: before.map(b => b.err) }); continue; }
      const atomsBefore = window.__diag.atomPositions().length;
      const bondsBefore = window.__diag.bonds().length;
      Math.random = window.__chirTest.rng(seed);
      window.__diag.perturb(0.35);
      window.__diag.runOpt();
      const after = ids.map(id => window.__chirTest.chirLocal(id));
      rows.push({
        seed,
        b: before.map(x => x.sign), a: after.map(x => x.sign),
        flip: before.map((x, i) => after[i].ok && x.sign !== after[i].sign),
        atoms: [atomsBefore, window.__diag.atomPositions().length],
        bonds: [bondsBefore, window.__diag.bonds().length]
      });
    }
    Math.random = orig;
    return {
      flips: rows.filter(r => r.flip && r.flip.some(Boolean)).length,
      broken: rows.filter(r => r.atoms[0] !== r.atoms[1] || r.bonds[0] !== r.bonds[1]).map(r => r.seed),
      rows: rows.length
    };
  });
  t('C6 环上手性中心 10 seeds 同手性且环不散',
    c6.flips === 0 && c6.broken.length === 0, JSON.stringify(c6));

  // ---------- C7 顶栏「优化」真实点击（公共入口） ----------
  const c7 = await page.evaluate(() => {
    const id = window.__chirTest.buildCStar(3, 72);
    const before = window.__chirTest.chirLocal(id);
    return { id, before };
  });
  await page.click('#btn-optimize-all');
  await page.waitForTimeout(400);
  const c7b = await page.evaluate((id) => {
    const after = window.__chirTest.chirLocal(id);
    const all = window.__chirality.all(0.05);
    return { after, inAll: all.some(r => r.id === id), sign: window.__chirality.sign(id) };
  }, c7.id);
  t('C7 顶栏「优化」按钮保持手性（公共入口）',
    c7.before.ok && c7b.after.ok && c7.before.sign === c7b.after.sign
      && c7b.after.angles.every(a => a > 95 && a < 125) && c7b.inAll,
    JSON.stringify({ b: c7.before.sign, a: c7b.after.sign, ang: c7b.after.angles }));

  // ---------- C8 2-丁醇 SMILES：生成 → 扰动 → 优化 ----------
  const c8gen = await page.evaluate(async () => {
    const res = await window.__generateFromSmiles('CC(O)CC');
    const centers = window.__chirality.all(0.05).filter(r => {
      const ts = r.types.slice().sort().join(',');
      return ts === 'C,C,H,O';
    });
    return {
      genOk: !!(res && (res.ok !== false)),
      atoms: window.__diag.atomPositions().length,
      centers: centers.map(r => ({ id: r.id, sign: r.sign, angles: r.angles }))
    };
  });
  const c8 = await page.evaluate(() => {
    const centers = window.__chirality.all(0.05).filter(r => {
      const ts = r.types.slice().sort().join(',');
      return ts === 'C,C,H,O';
    });
    if (!centers.length) return { err: 'no C,C,H,O center' };
    const id = centers[0].id;
    const before = window.__chirTest.chirLocal(id);
    const orig = Math.random;
    Math.random = window.__chirTest.rng(9);
    window.__diag.perturb(0.4);
    Math.random = orig;
    return { id, before };
  });
  if (c8.id != null) {
    await page.click('#btn-optimize-all');
    await page.waitForTimeout(400);
  }
  const c8after = c8.id != null ? await page.evaluate((id) => {
    const after = window.__chirTest.chirLocal(id);
    return { after };
  }, c8.id) : { after: { ok: false } };
  t('C8 2-丁醇 SMILES 生成 → 扰动 → 优化保持手性',
    c8gen.genOk && c8gen.centers.length >= 1 && c8.before && c8.before.ok
      && c8after.after.ok && c8.before.sign === c8after.after.sign
      && c8after.after.angles.every(a => a > 95 && a < 125),
    JSON.stringify({ gen: c8gen, b: c8.before && c8.before.sign, a: c8after.after.sign, ang: c8after.after.angles }));

  // ---------- C9 all()/sign() 一致性 ----------
  const c9 = await page.evaluate(() => {
    const all = window.__chirality.all(0.05);
    let mismatch = 0;
    for (const r of all) {
      const one = window.__chirality.of(r.id);
      const s = window.__chirality.sign(r.id);
      if (!one.ok || one.sign !== r.sign || s !== r.sign) mismatch++;
    }
    return { count: all.length, mismatch };
  });
  t('C9 __chirality.all()/of()/sign() 一致', c9.mismatch === 0 && c9.count > 0, JSON.stringify(c9));

  // ---------- C10 33 例几何自测 ----------
  await page.evaluate(() => { window.lastRunResults = null; window.runAllExamplesAndTests(); });
  await page.waitForFunction(
    () => window.lastRunResults && window.lastRunResults.results && window.lastRunResults.results.length === 33,
    null, { timeout: 600000 });
  const geom = await page.evaluate(() => ({
    total: window.lastRunResults.results.length,
    passed: window.lastRunResults.results.filter(r => r.pass).length,
    fails: window.lastRunResults.results.filter(r => !r.pass).map(r => r.example)
  }));
  t('C10 33 例几何自测全过', geom.total === 33 && geom.passed === 33, JSON.stringify(geom));

  // ---------- C11 零 console / pageerror ----------
  t('C11 零 console/page 错误', errs.length === 0, JSON.stringify(errs.slice(0, 6)));

  const passed = results.filter(r => r.pass).length;
  console.log('\nSUMMARY ' + passed + '/' + results.length + ' passed, ' + (Date.now() - started) + ' ms');
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
