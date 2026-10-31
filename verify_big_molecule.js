// 验证：大分子路线（2026-10-30）
//   ① 质量闸门：好分子放行 / 塌缩分子拒绝并回滚（保留原分子）/ keepExisting 只记录
//   ② RCSB 化学组分理想坐标：叶绿素 CLA、维生素B12 CNC、β-环糊精 BCD、α-环糊精 ACX
//   ③ 蛋白质名称 → RCSB PDB：细胞色素c 1HRC / 肌红蛋白 1MBO / 血红蛋白 2HHB
//   ④ 大结构视觉降噪：>1500 原子不建标签/光晕（选中时懒建）、>600 原子不画孤对
//   ⑤ 回归：33 几何自测 + 23 π 自测 + 零 pageerror
// 运行：cmd /c "node verify_big_molecule.js > verify_big_molecule.json 2>&1"
const { chromium } = require('playwright');

const URL = 'http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=bigmol';
// 纯离线、稳定触发闸门的坏 SMILES（螺缩醛笼，实测 9 处重叠 + 15 条坏键）
const BAD_SMILES = 'C1OC2OC3OC4OC1C1OC2C2OC3C3OC4C1C23';

const out = { name: 'verify_big_molecule', started: Date.now(), tests: [], pass: 0, fail: 0, errors: [] };
const t = (name, cond, detail) => {
  out.tests.push({ name, pass: !!cond, detail: detail === undefined ? '' : String(detail).slice(0, 600) });
  if (cond) out.pass++; else out.fail++;
};

// 页面内统计：元素计数 / 连通分量 / 非键最近距离 / 坏键数
const STATS_FN = `(function(limit){
  const atoms = window.__diag.atomPositions();
  const bd = window.__diag.bonds().filter(b => !b.coordination);
  const cnt = {};
  const cntU = {};
  atoms.forEach(a => {
    cnt[a.type] = (cnt[a.type] || 0) + 1;
    const u = String(a.type).toUpperCase();
    cntU[u] = (cntU[u] || 0) + 1;
  });
  const adj = new Map();
  atoms.forEach(a => adj.set(a.id, new Set()));
  bd.forEach(b => { adj.get(b.pair[0]).add(b.pair[1]); adj.get(b.pair[1]).add(b.pair[0]); });
  const seen = new Set(); const comps = [];
  for (const a of atoms) {
    if (seen.has(a.id)) continue;
    const st = [a.id]; seen.add(a.id); let n = 0;
    while (st.length) { const q = st.pop(); n++; for (const nb of adj.get(q)) if (!seen.has(nb)) { seen.add(nb); st.push(nb); } }
    comps.push(n);
  }
  comps.sort((x, y) => y - x);
  let minD = 99, clashes = 0;
  const lim = Math.min(atoms.length, limit || 1500);
  for (let i = 0; i < lim; i++) {
    for (let j = i + 1; j < lim; j++) {
      const A = atoms[i], B = atoms[j];
      if (adj.get(A.id).has(B.id)) continue;
      const d2 = (A.x - B.x) ** 2 + (A.y - B.y) ** 2 + (A.z - B.z) ** 2;
      if (d2 < minD) minD = d2;
      if (d2 < 0.64) clashes++;
    }
  }
  let badBonds = 0, maxDev = 0;
  bd.forEach(b => {
    if (!b.target || b.target < 0.4) return;
    const dev = Math.abs(b.len - b.target) / b.target;
    if (dev > maxDev) maxDev = dev;
    if (dev > 0.35) badBonds++;
  });
  return {
    atoms: atoms.length, bonds: bd.length, cnt, cntU,
    nComp: comps.length, comps: comps.slice(0, 6),
    minD: +Math.sqrt(minD).toFixed(2), clashes, badBonds, maxDev: +maxDev.toFixed(2)
  };
})`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e).slice(0, 300)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const s = m.text();
    if (/Failed to load resource/.test(s)) return;   // PubChem/RCSB 404 属预期噪声
    consoleErrors.push(s.slice(0, 300));
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.__generateFromSmiles && window.__assessMoleculeQuality && window.__generateFromProteinPDB && window.__generateFromRcsbLigand,
    null, { timeout: 30000 }
  );
  await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(false));

  // ================= A. 质量闸门（真假阳性） =================
  const a1 = await page.evaluate(() => ({
    assess: typeof window.__assessMoleculeQuality,
    describe: typeof window.__describeQualityFailure,
    protein: typeof window.__generateFromProteinPDB,
    ligand: typeof window.__generateFromRcsbLigand
  }));
  t('A1 闸门 / 蛋白 / RCSB 组分 API 已暴露',
    a1.assess === 'function' && a1.describe === 'function' && a1.protein === 'function' && a1.ligand === 'function',
    JSON.stringify(a1));

  const GOOD = ['C1CC1', 'C1CCC1', 'C12C3C4C1C5C2C3C45', 'C1=CC=CC=C1', 'O=S(=O)(O)O', 'C#N', '[Fe]', 'CCCC', 'CCCCC', 'CC(=O)O', 'C1CCCCC1'];
  const a2 = await page.evaluate(async (list) => {
    const res = [];
    for (const s of list) {
      const g = await window.__generateFromSmiles(s);
      res.push({ s, ok: g.ok, atoms: g.atomCount, q: g.quality ? g.quality.ok : null, clash: g.quality ? g.quality.clashes : null, bad: g.quality ? g.quality.badBonds : null });
    }
    return res;
  }, GOOD);
  const a2bad = a2.filter(x => !x.ok || x.q !== true);
  t('A2 合法分子（含张力环/立方烷/硫酸/单原子）全部放行', a2bad.length === 0, JSON.stringify(a2bad));

  const a3 = await page.evaluate(() => {
    const d1 = window.__describeQualityFailure({ components: 3, expectedFragments: 1, clashes: 5, worstPair: { d: 0.42 }, badBonds: 7 });
    const d2 = window.__describeQualityFailure({ components: 1, expectedFragments: 1, clashes: 0, worstPair: null, badBonds: 0 });
    return { d1, d2 };
  });
  t('A3 失败文案分项（骨架断裂/原子重叠/键长异常）',
    /骨架断裂（3 个碎片，预期 1）/.test(a3.d1) && /5 处原子重叠/.test(a3.d1) && /0\.42/.test(a3.d1) && /7 条键长异常/.test(a3.d1) && /几何不合格/.test(a3.d2),
    a3.d1 + ' | ' + a3.d2);

  const a4b = await page.evaluate(async (fnSrc) => {
    const g = await window.__generateFromSmiles('CC.O');
    const stats = (new Function('return ' + fnSrc))()();
    return { ok: g.ok, atoms: g.atomCount, q: g.quality, stats };
  }, STATS_FN);
  t('A4 多片段 SMILES（CC.O）按片段数放行、连通分量=2',
    a4b.ok && a4b.q && a4b.q.expectedFragments === 2 && a4b.q.components === 2 && a4b.stats.nComp === 2,
    JSON.stringify({ ok: a4b.ok, q: a4b.q, nComp: a4b.stats && a4b.stats.nComp }));

  const a5 = await page.evaluate(async (bad) => {
    const g = await window.__generateFromSmiles(bad);
    const st = window.__diag.visualStats();
    return { ok: g.ok, rolledBack: !!g.rolledBack, q: window.__LAST_MOL_QUALITY, st };
  }, BAD_SMILES);
  t('A5 塌缩分子被判失败（重叠+坏键）',
    a5.ok === false && a5.q && a5.q.ok === false && a5.q.clashes > 0 && a5.q.badBonds > 0,
    JSON.stringify({ ok: a5.ok, q: a5.q && { ok: a5.q.ok, comp: a5.q.components, clash: a5.q.clashes, bad: a5.q.badBonds, atoms: a5.q.atoms } }));

  // ================= B. 闸门集成（回滚保留原分子） =================
  const b = await page.evaluate(async (bad) => {
    document.getElementById('btn-clear-molecule').click();
    const base = await window.__generateFromSmiles('c1ccccc1');
    const beforeAtoms = window.__diag.atomPositions().length;
    const g = await window.__generateFromSmiles(bad);
    const afterAtoms = window.__diag.atomPositions().length;
    const st = window.__statusBar();
    return {
      baseOk: base.ok, beforeAtoms,
      ok: g.ok, rolledBack: !!g.rolledBack,
      msg: g.error ? String(g.error.msg || '') : '',
      afterAtoms, formula: st.formula
    };
  }, BAD_SMILES);
  t('B1 闸门拦截并回滚（rolledBack=true，文案指向几何引擎）',
    b.baseOk && b.ok === false && b.rolledBack === true && /本地几何引擎/.test(b.msg),
    JSON.stringify({ ok: b.ok, rolledBack: b.rolledBack, msg: b.msg.slice(0, 80) }));
  t('B2 回滚后画布保留生成前的苯环（12 原子 / C6H6）',
    b.beforeAtoms === 12 && b.afterAtoms === 12 && b.formula === 'C6H6',
    JSON.stringify({ before: b.beforeAtoms, after: b.afterAtoms, formula: b.formula }));

  const b3 = await page.evaluate(async () => {
    document.getElementById('btn-clear-molecule').click();
    await window.__generateFromSmiles('CCC');            // 成功路径
    const okRec = window.__LAST_MOL_QUALITY;
    const good = { ok: okRec ? okRec.ok : null, atoms: okRec ? okRec.atoms : null };
    const g = await window.__generateFromSmiles('C1OC2OC3OC4OC1C1OC2C2OC3C3OC4C1C23');  // 失败路径
    const badRec = window.__LAST_MOL_QUALITY;
    return { good, bad: { ok: badRec ? badRec.ok : null, comp: badRec ? badRec.components : null } };
  });
  t('B3 __LAST_MOL_QUALITY 如实记录成功/失败（UI 诊断依据）',
    b3.good.ok === true && b3.good.atoms === 11 && b3.bad.ok === false,
    JSON.stringify(b3));

  const b4 = await page.evaluate(async (bad) => {
    document.getElementById('btn-clear-molecule').click();
    await window.__generateFromSmiles('CCC');
    const g = await window.__generateFromSmiles(bad, { keepExisting: true });
    const n = window.__diag.atomPositions().length;
    return { ok: g.ok, qOk: g.quality ? g.quality.ok : null, atoms: n };
  }, BAD_SMILES);
  t('B4 keepExisting（异构体并排）只记录不拦截',
    b4.ok === true && b4.qOk === false && b4.atoms > 11,
    JSON.stringify(b4));

  // ================= C. RCSB 化学组分 =================
  const c1 = await page.evaluate(() => {
    const cases = ['叶绿素', '叶绿素a', 'chlorophyll', '维生素B12', '维生素b12', 'vitamin b12', '环糊精', 'β-环糊精', 'beta-cyclodextrin', 'α-环糊精', 'alpha-cyclodextrin'];
    const got = cases.map(c => {
      const r = window.__resolveRcsbLigand(c);
      return { c, id: r ? r.ligandId : null };
    });
    return { got, alpha: (window.__resolveRcsbLigand('α-环糊精') || {}).ligandId, beta: (window.__resolveRcsbLigand('β-环糊精') || {}).ligandId };
  });
  const c1bad = c1.got.filter(x => !x.id);
  t('C1 天然产物名称映射（中文/英文/希腊字母）', c1bad.length === 0 && c1.alpha === 'ACX' && c1.beta === 'BCD' && c1.alpha !== c1.beta,
    JSON.stringify({ bad: c1bad, alpha: c1.alpha, beta: c1.beta }));

  const ligResult = {};
  for (const [id, label] of [['CLA', '叶绿素'], ['CNC', '维生素B12'], ['BCD', 'β-环糊精'], ['ACX', 'α-环糊精']]) {
    const r = await page.evaluate(async ({ id, label, fnSrc }) => {
      document.getElementById('btn-clear-molecule').click();
      const t0 = performance.now();
      const g = await window.__generateFromRcsbLigand(id, label);
      const ms = Math.round(performance.now() - t0);
      if (!g.ok) return { ok: false, err: g.error, ms };
      const st = (new Function('return ' + fnSrc))()();
      return { ok: true, ms, count: g.count, lid: g.ligandId, stats: st };
    }, { id, label, fnSrc: STATS_FN });
    ligResult[id] = r;
  }
  t('C2 CLA 叶绿素：137 原子 / 含 Mg / 单连通 / 0 重叠',
    ligResult.CLA.ok && ligResult.CLA.count === 137 && ligResult.CLA.stats.cntU.MG === 1
    && ligResult.CLA.stats.nComp === 1 && ligResult.CLA.stats.clashes === 0,
    JSON.stringify(ligResult.CLA));
  t('C3 CNC 维生素B12：182 原子 / 含 Co / 单连通 / 0 重叠',
    ligResult.CNC.ok && ligResult.CNC.count === 182 && ligResult.CNC.stats.cntU.CO === 1
    && ligResult.CNC.stats.nComp === 1 && ligResult.CNC.stats.clashes === 0,
    JSON.stringify(ligResult.CNC));
  t('C4 BCD 147 原子 / ACX 126 原子（α≠β）均单连通 0 重叠',
    ligResult.BCD.ok && ligResult.BCD.count === 147 && ligResult.BCD.stats.nComp === 1 && ligResult.BCD.stats.clashes === 0
    && ligResult.ACX.ok && ligResult.ACX.count === 126 && ligResult.ACX.stats.nComp === 1 && ligResult.ACX.stats.clashes === 0,
    JSON.stringify({ BCD: ligResult.BCD.count, ACX: ligResult.ACX.count }));

  // UI 真实路径
  await page.evaluate(() => window.__setInputPanelOpen(true));
  await page.fill('#name-input', '叶绿素');
  await page.click('#btn-molecule-from-input');
  await page.waitForFunction(() => {
    const el = document.getElementById('toast-message');
    return el && /已从名称生成|几何引擎|获取失败|未找到/.test(el.textContent) && !/正在/.test(el.textContent);
  }, null, { timeout: 60000 });
  await page.waitForTimeout(250);
  const c5 = await page.evaluate(() => {
    const el = document.getElementById('toast-message');
    return { toast: el ? el.textContent : '', atoms: window.__diag.atomPositions().length, formula: window.__statusBar().formula };
  });
  t('C5 UI 名称「叶绿素」→ RCSB 组分 CLA / 137 原子',
    /RCSB 组分 CLA/.test(c5.toast) && c5.atoms === 137
    && /^C55H72MG?N4O5$/i.test(c5.formula.replace(/[^A-Za-z0-9]/g, '')),
    JSON.stringify(c5));

  // ================= D. 蛋白质 PDB 路线 =================
  const d1 = await page.evaluate(async (fnSrc) => {
    document.getElementById('btn-clear-molecule').click();
    const t0 = performance.now();
    const g = await window.__generateFromProteinPDB('1HRC', '细胞色素c');
    const ms = Math.round(performance.now() - t0);
    const stats = (new Function('return ' + fnSrc))()();
    const vis = window.__diag.visualStats();
    return { ok: g.ok, count: g.count, ms, stats, vis, angleStd: +window.__statusBar().angleStd.toFixed(1) };
  }, STATS_FN);
  t('D1 1HRC 细胞色素c：866 原子 / 含 1 Fe / 单连通 / 0 重叠',
    d1.ok && d1.count === 866 && d1.stats.cnt.Fe === 1 && d1.stats.nComp === 1 && d1.stats.clashes === 0,
    JSON.stringify({ count: d1.count, Fe: d1.stats.cnt.Fe, nComp: d1.stats.nComp, clash: d1.stats.clashes, ms: d1.ms }));
  t('D2 1HRC 保留标签、>600 原子不画孤对',
    d1.vis.labels === 866 && d1.vis.lpDisabled === true && d1.stats.atoms === 866,
    JSON.stringify(d1.vis));

  const d3 = await page.evaluate(async (fnSrc) => {
    document.getElementById('btn-clear-molecule').click();
    const t0 = performance.now();
    const g = await window.__generateFromProteinPDB('1MBO', '肌红蛋白');
    const ms = Math.round(performance.now() - t0);
    const stats = (new Function('return ' + fnSrc))()();
    return { ok: g.ok, count: g.count, ms, stats };
  }, STATS_FN);
  t('D3 1MBO 肌红蛋白：1260 原子 / 含 1 Fe / 单连通',
    d3.ok && d3.count === 1260 && d3.stats.cnt.Fe === 1 && d3.stats.nComp === 1,
    JSON.stringify({ count: d3.count, Fe: d3.stats.cnt.Fe, nComp: d3.stats.nComp, ms: d3.ms }));

  const d4 = await page.evaluate(async () => {
    document.getElementById('btn-clear-molecule').click();
    const t0 = performance.now();
    const g = await window.__generateFromProteinPDB('2HHB', '血红蛋白');
    const ms = Math.round(performance.now() - t0);
    const vis = window.__diag.visualStats();
    const t1 = performance.now();
    const sb = window.__statusBar();
    const msStatus = Math.round(performance.now() - t1);
    return { ok: g.ok, count: g.count, ms, vis, msStatus, sb: { atoms: sb.atoms, bonds: sb.bonds, formula: sb.formula, rings: sb.rings, angleStd: +sb.angleStd.toFixed(1) } };
  });
  t('D4 2HHB 血红蛋白：4556 原子 / 4 Fe / 4 条链（四聚体）',
    d4.ok && d4.count === 4556 && d4.vis.atoms === 4556
    && /^C2954FE4N780O806S12$/i.test(d4.sb.formula.replace(/[^A-Za-z0-9]/g, '')),
    JSON.stringify({ count: d4.count, formula: d4.sb.formula, atoms: d4.vis.atoms }));
  t('D5 2HHB 状态条不再卡顿（<3000ms）且角度 RMS 修好后 <40°',
    d4.msStatus < 3000 && d4.sb.angleStd > 0 && d4.sb.angleStd < 40,
    JSON.stringify({ msStatus: d4.msStatus, angleStd: d4.sb.angleStd }));

  const d6 = await page.evaluate(() => {
    const vis0 = window.__diag.visualStats();
    const picked = window.__dragMode.selectFirstAtom();
    const vis1 = window.__diag.visualStats();
    return { picked, vis0, vis1 };
  });
  t('D6 大结构省掉标签/光晕，选中原子时懒建 1 个光晕',
    d6.picked && d6.vis0.labels === 0 && d6.vis0.glows === 0 && d6.vis1.glows === 1 && d6.vis1.visibleGlows === 1,
    JSON.stringify(d6));

  const d7 = await page.evaluate(async () => {
    document.getElementById('btn-clear-molecule').click();
    await window.__generateFromSmiles('CO');
    const lp = window.__lpStats();
    const o = lp.find(x => x.t === 'O');
    const vis = window.__diag.visualStats();
    const clouds = o ? o.meshes.filter(m => m.vis && m.r > 0.3).length : null;   // 云半径 0.40，电子点 0.09
    return { lpDisabled: vis.lpDisabled, oLP: o ? o.nLP : null, clouds, visMeshes: o ? o.meshes.filter(m => m.vis).length : null };
  });
  t('D7 小分子孤对不受影响（甲醇 O=2 对、2 朵云可见）',
    d7.lpDisabled === false && d7.oLP === 2 && d7.clouds === 2 && d7.visMeshes === 6,
    JSON.stringify(d7));

  // ================= E. 回归（几何 + π + console） =================
  await page.evaluate(() => { try { window.runAllExamplesAndTests(); } catch (e) {} });
  await page.waitForFunction(
    () => !!(window.lastRunResults && window.lastRunResults.results && window.lastRunResults.results.length === 33),
    null, { timeout: 10 * 60 * 1000 }
  );
  const e1 = await page.evaluate(() => {
    const r = window.lastRunResults;
    return { total: r.results.length, passed: r.results.filter(x => x.pass).length, fails: r.results.filter(x => !x.pass).map(x => x.example) };
  });
  t('E1 33 几何自测全过', e1.passed === 33, JSON.stringify(e1));

  const e2 = await page.evaluate(() => {
    const r = window.__runPiSystemTests();
    return { n: r.length, passed: r.filter(x => x.pass).length, fails: r.filter(x => !x.pass).map(x => x.key) };
  });
  t('E2 π 体系自测全过（23 项）', e2.n === 23 && e2.passed === 23, JSON.stringify(e2));

  t('E3 零 pageerror / 零真实 console error', pageErrors.length === 0 && consoleErrors.length === 0,
    JSON.stringify({ pageErrors, consoleErrors }));

  out.elapsedMs = Date.now() - out.started;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => {
  console.error('FATAL', e && e.stack || e);
  process.exit(1);
});
