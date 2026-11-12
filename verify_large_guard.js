// 验证：大分子结构保护（2026-11）
//   ① 全局优化对蛋白/大分子直接跳过（不再把骨架拉散）
//   ② 大分子左键拖动 = 旋转视角；先单击选中、再拖动才移动原子
// 运行：cmd /c "node verify_large_guard.js > verify_large_guard.json 2>&1"
const { chromium } = require('playwright');

const out = { name: 'verify_large_guard', started: Date.now(), tests: [], pass: 0, fail: 0, errors: [] };
const t = (name, cond, detail) => {
  out.tests.push({ name, pass: !!cond, detail: detail === undefined ? '' : String(detail).slice(0, 600) });
  if (cond) out.pass++; else out.fail++;
};

// 页面内：原子/键/连通分量/几何质量/结构保护状态
const readStats = () => {
  const atoms = window.__diag.atomPositions();
  const bonds = window.__diag.bonds();
  const adj = new Map(); atoms.forEach(a => adj.set(a.id, new Set()));
  bonds.forEach(b => { adj.get(b.pair[0]).add(b.pair[1]); adj.get(b.pair[1]).add(b.pair[0]); });
  const seen = new Set(); const comps = [];
  for (const a of atoms) {
    if (seen.has(a.id)) continue;
    const st = [a.id]; seen.add(a.id); let c = 0;
    while (st.length) { const id = st.pop(); c++; for (const nb of adj.get(id)) if (!seen.has(nb)) { seen.add(nb); st.push(nb); } }
    comps.push(c);
  }
  comps.sort((x, y) => y - x);
  return {
    atoms: atoms.length, bonds: bonds.length, comps, nComp: comps.length,
    maxLen: +Math.max(...bonds.map(b => b.len)).toFixed(3),
    bad: bonds.filter(b => !b.coordination && Math.abs(b.len - b.target) / b.target > 0.35).length,
    guard: window.__structureGuard.state(),
    precise: window.__structureGuard.precise(),
    skip: window.__structureGuard.lastSkip(),
    cam: window.__diag.camInfo(),
    sel: window.__structureGuard.selected()
  };
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)); });

  await page.goto('http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=largeguard', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__diag && window.__generateFromInput && window.__structureGuard, null, { timeout: 30000 });

  // ---------- G1 胰岛素（403 原子）生成：单连通、结构保护生效 ----------
  await page.evaluate(() => window.__setInputPanelOpen(true));
  await page.waitForTimeout(250);
  await page.fill('#name-input', '胰岛素');
  await page.click('#btn-molecule-from-input');
  await page.waitForFunction(() => /已从名称生成: 胰岛素/.test((document.getElementById('toast-message') || {}).textContent || ''), null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  const gen = await page.evaluate(readStats);
  t('G1 胰岛素 403 原子 / 414 键 / 单连通，结构保护已生效',
    gen.atoms === 403 && gen.bonds === 414 && gen.nComp === 1 && gen.bad === 0
    && gen.guard.protect === true && gen.guard.reason === 'large' && gen.precise === true,
    JSON.stringify({ atoms: gen.atoms, bonds: gen.bonds, comps: gen.comps, bad: gen.bad, guard: gen.guard, precise: gen.precise }));

  // ---------- G2 点「优化」：跳过且不破坏结构 ----------
  await page.evaluate(() => window.__structureGuard.clearLastSkip());
  await page.click('#btn-optimize-all');
  await page.waitForTimeout(1200);
  const optToast = await page.evaluate(() => (document.getElementById('toast-message') || {}).textContent || '');
  const opt = await page.evaluate(readStats);
  t('G2 点「优化」被结构保护跳过（toast + lastSkip），键数/连通性/键长不变',
    /已跳过全局优化/.test(optToast) && !!opt.skip && opt.skip.atoms === 403 && opt.skip.reason === 'large'
    && opt.bonds === 414 && opt.nComp === 1 && opt.bad === 0 && opt.maxLen <= 2.1,
    JSON.stringify({ toast: optToast, skip: opt.skip, bonds: opt.bonds, comps: opt.comps, bad: opt.bad, maxLen: opt.maxLen }));

  // ---------- G3 Shift+O 同样被跳过 ----------
  await page.evaluate(() => window.__structureGuard.clearLastSkip());
  await page.keyboard.press('Shift+O');
  await page.waitForTimeout(900);
  const shiftO = await page.evaluate(readStats);
  t('G3 Shift+O 快捷键同样被跳过，结构不变',
    !!shiftO.skip && shiftO.skip.reason === 'large' && shiftO.bonds === 414 && shiftO.nComp === 1,
    JSON.stringify({ skip: shiftO.skip, bonds: shiftO.bonds, comps: shiftO.comps }));

  // ---------- G4 密集结构上左键拖动 = 旋转视角，不拖原子 ----------
  const box = await page.locator('canvas[data-engine]').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const centerPick = await page.evaluate(({ x, y }) => window.__dragMode.pickAt(x, y), { x: cx, y: cy });
  const camBefore = shiftO.cam.pos;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 150, cy + 55, { steps: 18 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  const rotated = await page.evaluate(readStats);
  const camMoved = rotated.cam.pos.join(',') !== camBefore.join(',');
  // 大分子不挂删除图标：远视角 20px 图标会压住原子中心（误点即删原子）
  const largeIcon = await page.evaluate(() => !!document.querySelector('[title="删除选中原子"]'));
  t('G4 大分子上左键拖动 = 旋转视角（相机变化、键数不变、只选中不拖动、无删除图标）',
    !!centerPick && centerPick.kind === 'atom' && camMoved
    && rotated.bonds === 414 && rotated.nComp === 1 && !!rotated.sel && largeIcon === false,
    JSON.stringify({ pick: centerPick, camBefore, camAfter: rotated.cam.pos, bonds: rotated.bonds, sel: rotated.sel && rotated.sel.id, deleteIcon: largeIcon }));

  // ---------- G5 放大后：先单击选中，再拖动可移动原子 ----------
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 9; i++) { await page.mouse.wheel(0, -500); await page.waitForTimeout(70); }
  await page.waitForTimeout(600);
  const target = await page.evaluate(({ cx, cy }) => {
    const atoms = window.__diag.atomPositions();
    let best = null, bestD = 1e9;
    for (const a of atoms) {
      const s = window.__dragMode.project(a.x, a.y, a.z);
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (d > 220 || d >= bestD) continue;
      const hit = window.__dragMode.pickAt(s.x, s.y);
      if (!hit || hit.kind !== 'atom' || hit.id !== a.id) continue;
      bestD = d; best = { id: a.id, p: a, s };
    }
    return best;
  }, { cx, cy });
  let movedBy = null, selAfterClick = null, onCanvas = false;
  if (target) {
    await page.mouse.click(target.s.x, target.s.y);
    await page.waitForTimeout(450);
    selAfterClick = await page.evaluate(() => window.__structureGuard.selected());
    onCanvas = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y).tagName === 'CANVAS', { x: target.s.x, y: target.s.y });
    await page.mouse.move(target.s.x, target.s.y);
    await page.mouse.down();
    await page.mouse.move(target.s.x + 70, target.s.y + 30, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    const after = await page.evaluate((id) => {
      const a = window.__diag.atomPositions().find(x => x.id === id);
      return a ? [a.x, a.y, a.z] : null;
    }, target.id);
    if (after) movedBy = +Math.hypot(after[0] - target.p.x, after[1] - target.p.y, after[2] - target.p.z).toFixed(3);
  }
  t('G5 放大后单击选中、再拖动可移动原子（编辑能力保留）',
    !!target && !!selAfterClick && selAfterClick.id === target.id && onCanvas && movedBy !== null && movedBy > 0.5,
    JSON.stringify({ targetId: target && target.id, sel: selAfterClick && selAfterClick.id, onCanvas, movedBy }));

  // ---------- G6 Ctrl+Z 恢复被拖动的原子 ----------
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(900);
  const undone = await page.evaluate(readStats);
  t('G6 撤销恢复蛋白几何（414 键 / 单连通）',
    undone.bonds === 414 && undone.nComp === 1 && undone.atoms === 403,
    JSON.stringify({ atoms: undone.atoms, bonds: undone.bonds, comps: undone.comps }));

  // ---------- G7 小分子：不触发保护，按下即可直接拖动 ----------
  const small = await page.evaluate(() => {
    window.__diag.generateSpec('benzene');
    const atoms = window.__diag.atomPositions();
    const a = atoms[0];
    return { id: a.id, p: a, s: window.__dragMode.project(a.x, a.y, a.z), guard: window.__structureGuard.state(), precise: window.__structureGuard.precise(), count: atoms.length };
  });
  await page.mouse.move(small.s.x, small.s.y);
  await page.mouse.down();
  await page.mouse.move(small.s.x + 80, small.s.y + 30, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const smallAfter = await page.evaluate((id) => {
    const a = window.__diag.atomPositions().find(x => x.id === id);
    return { p: a ? [a.x, a.y, a.z] : null, guard: window.__structureGuard.state(), precise: window.__structureGuard.precise() };
  }, small.id);
  const smallMoved = smallAfter.p ? +Math.hypot(smallAfter.p[0] - small.p.x, smallAfter.p[1] - small.p.y, smallAfter.p[2] - small.p.z).toFixed(3) : 0;
  // 小分子仍保留删除图标（选中原子右上角垃圾桶）
  await page.waitForTimeout(300);
  const smallIcon = await page.evaluate(() => !!document.querySelector('[title="删除选中原子"]'));
  t('G7 小分子（苯 12 原子）不触发保护，按下即可直接拖动、删除图标保留',
    small.count === 12 && small.guard.protect === false && small.precise === false
    && smallAfter.guard.protect === false && smallMoved > 0.5 && smallIcon === true,
    JSON.stringify({ count: small.count, guard: small.guard, precise: small.precise, moved: smallMoved, deleteIcon: smallIcon }));

  // ---------- G8 小分子「优化」仍然正常执行 ----------
  await page.evaluate(() => { window.__diag.generateSpec('benzene'); window.__structureGuard.clearLastSkip(); });
  await page.waitForTimeout(200);
  await page.click('#btn-optimize-all');
  await page.waitForTimeout(900);
  const smallOpt = await page.evaluate(() => ({
    skip: window.__structureGuard.lastSkip(),
    bonds: window.__diag.bonds().length,
    atoms: window.__diag.atomPositions().length,
    bad: window.__diag.bonds().filter(b => !b.coordination && Math.abs(b.len - b.target) / b.target > 0.35).length
  }));
  t('G8 小分子「优化」未被保护拦截（无 lastSkip、12 原子/12 键、无坏键）',
    !smallOpt.skip && smallOpt.atoms === 12 && smallOpt.bonds === 12 && smallOpt.bad === 0,
    JSON.stringify(smallOpt));

  // ---------- G9 33 例几何自测无回归 ----------
  await page.evaluate(() => { window.lastRunResults = null; window.runAllExamplesAndTests(); });
  await page.waitForFunction(() => window.lastRunResults && window.lastRunResults.results && window.lastRunResults.results.length === 33, null, { timeout: 600000 });
  const geom = await page.evaluate(() => ({
    total: window.lastRunResults.results.length,
    passed: window.lastRunResults.results.filter(r => r.pass).length,
    fails: window.lastRunResults.results.filter(r => !r.pass).map(r => r.example)
  }));
  t('G9 33 例几何自测全过', geom.total === 33 && geom.passed === 33, JSON.stringify(geom));

  // ---------- G10 零 console / pageerror ----------
  t('G10 零 console/page 错误', errs.length === 0, JSON.stringify(errs));

  out.errors = errs;
  out.elapsedMs = Date.now() - out.started;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(2); });
