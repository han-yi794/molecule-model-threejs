// 验证：蛋白质名称 → RCSB PDB 实验结构（胰岛素 3I40 等）
// 运行：cmd /c "node verify_protein_pdb.js > verify_protein_pdb.json 2>&1"
const { chromium } = require('playwright');

const out = { name: 'verify_protein_pdb', started: Date.now(), tests: [], pass: 0, fail: 0, errors: [] };
const t = (name, cond, detail) => {
  out.tests.push({ name, pass: !!cond, detail: detail === undefined ? '' : String(detail).slice(0, 500) });
  if (cond) out.pass++; else out.fail++;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 300)));

  await page.goto('http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=proteinpdb', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__generateFromInput && window.__fetchProteinPDBById && window.__generateFromProteinPDB, null, { timeout: 20000 });
  await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(true));
  await page.waitForTimeout(300);

  // ---------- P1 名称解析 ----------
  const p1 = await page.evaluate(() => {
    const cases = ['胰岛素', 'insulin', 'Insulin', ' 胰岛素 ', '人胰岛素', '溶菌酶', 'lysozyme', '核糖核酸酶A', 'RNase A', '细胞色素c', 'cytochrome c'];
    return cases.map(c => {
      const r = window.__resolveProteinName(c);
      return { input: c, pdbId: r ? r.pdbId : null };
    });
  });
  const p1bad = p1.filter(x => !x.pdbId);
  t('P1 蛋白名称库解析（中文/英文/大小写/空格）', p1bad.length === 0, JSON.stringify(p1bad));
  t('P1b 胰岛素 → 3I40', p1[0].pdbId === '3I40', JSON.stringify(p1[0]));
  t('P1c 非蛋白名称不误判', await page.evaluate(() => !window.__resolveProteinName('乙醇') && !window.__resolveProteinName('benzene')), '');

  // ---------- P2 parsePDB 过滤选项单测 ----------
  const p2 = await page.evaluate(() => {
    const line = (rec, serial, atomName, alt, resName, chain, resSeq, x, y, z, element) => {
      const arr = new Array(80).fill(' ');
      const put = (start, str) => { for (let i = 0; i < str.length; i++) arr[start + i] = str[i]; };
      put(0, rec.padEnd(6));
      put(6, String(serial).padStart(5));
      put(12, atomName.padStart(4));
      put(16, alt);
      put(17, resName.padStart(3));
      put(21, chain);
      put(22, String(resSeq).padStart(4));
      put(30, x.toFixed(3).padStart(8));
      put(38, y.toFixed(3).padStart(8));
      put(46, z.toFixed(3).padStart(8));
      put(76, element.padStart(2));
      return arr.join('');
    };
    const text = [
      line('ATOM  ', 1, 'C', ' ', 'GLY', 'A', 1, 0.0, 0, 0, 'C'),
      line('ATOM  ', 2, 'N', 'A', 'GLY', 'A', 1, 1.3, 0, 0, 'N'),
      line('ATOM  ', 3, 'O', 'B', 'GLY', 'A', 1, 2.6, 0, 0, 'O'),
      line('HETATM', 4, 'O', ' ', 'HOH', 'A', 2, 3.9, 0, 0, 'O'),
    ].join('\n');
    const def = window.__parsePDB(text);
    const pro = window.__parsePDB(text, { proteinOnly: true, altLocFirst: true });
    return {
      defaultAtoms: def ? def.atoms.map(a => a.type) : null,
      proteinAtoms: pro ? pro.atoms.map(a => a.type) : null,
      proteinBonds: pro ? pro.bonds.length : -1
    };
  });
  t('P2 默认 parsePDB 仍含 HETATM/全部 altLoc（ESMFold 路线不变）', p2.defaultAtoms && p2.defaultAtoms.length === 4, JSON.stringify(p2));
  t('P3 proteinOnly+altLocFirst 只留 ATOM 且 altLoc ∈ {空格,A}', p2.proteinAtoms && p2.proteinAtoms.length === 2 && p2.proteinAtoms.join(',') === 'C,N', JSON.stringify(p2));

  // ---------- P4 3I40 拉取与坐标质量 ----------
  const p4 = await page.evaluate(async () => {
    const t0 = performance.now();
    const r = await window.__fetchProteinPDBById('3I40');
    const ms = Math.round(performance.now() - t0);
    if (!r.ok) return { ok: false, error: r.error, ms };
    const st = r.struct;
    const dbl = st.bonds.filter(b => b[2] === 2).length;
    return { ok: true, atoms: st.atoms.length, bonds: st.bonds.length, carbonyls: r.carbonyls, dbl, ms, pdbId: r.pdbId };
  });
  t('P4 fetchProteinPDBById(3I40) 拉取成功', p4.ok, JSON.stringify(p4));
  t('P4b 3I40 过滤后 403 原子 / 414 键', p4.ok && p4.atoms === 403 && p4.bonds === 414, JSON.stringify({ atoms: p4.atoms, bonds: p4.bonds }));
  t('P4c 羰基 C=O 键级推断生效（双键 ≥ 20 条）', p4.ok && p4.dbl >= 20 && p4.dbl === p4.carbonyls, JSON.stringify({ dbl: p4.dbl, carbonyls: p4.carbonyls }));

  // ---------- P5 generateFromProteinPDB 几何质量 ----------
  const p5 = await page.evaluate(() => {
    const n = window.__generateFromProteinPDB('3I40', '胰岛素');
    return n.then(r => {
      if (!r.ok) return { ok: false, error: r.error };
      const atoms = window.__diag.atomPositions();
      const bonds = window.__diag.bonds();
      const adj = new Map(); atoms.forEach(a => adj.set(a.id, new Set()));
      bonds.forEach(b => { adj.get(b.pair[0]).add(b.pair[1]); adj.get(b.pair[1]).add(b.pair[0]); });
      const seen = new Set(); const comps = [];
      for (const a of atoms) {
        if (seen.has(a.id)) continue;
        const stack = [a.id]; seen.add(a.id); let c = 0;
        while (stack.length) { const id = stack.pop(); c++; for (const nb of adj.get(id)) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); } }
        comps.push(c);
      }
      comps.sort((x, y) => y - x);
      let clash = 0, minD = 1e9, maxLen = 0;
      for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
        const A = atoms[i], B = atoms[j];
        const d2 = (A.x - B.x) ** 2 + (A.y - B.y) ** 2 + (A.z - B.z) ** 2;
        if (d2 < minD) minD = d2;
        if (d2 < 0.64 && !adj.get(A.id).has(B.id)) clash++;
      }
      bonds.forEach(b => { if (b.len > maxLen) maxLen = b.len; });
      const ss = bonds.filter(b => b.types[0] === 'S' && b.types[1] === 'S').map(b => +b.len.toFixed(2));
      const cnt = {}; atoms.forEach(a => { cnt[a.type] = (cnt[a.type] || 0) + 1; });
      return { ok: true, count: r.count, nAtoms: atoms.length, nBonds: bonds.length, comps, nComp: comps.length, clash, minD: +Math.sqrt(minD).toFixed(2), maxLen: +maxLen.toFixed(2), ss, cnt };
    });
  });
  t('P5 3I40 生成 403 原子', p5.ok && p5.nAtoms === 403, JSON.stringify(p5));
  t('P5b 单一连通分量（无碎片）', p5.ok && p5.nComp === 1 && p5.comps[0] === 403, JSON.stringify(p5.comps));
  t('P5c 3 条二硫键 2.0-2.1Å', p5.ok && p5.ss.length === 3 && p5.ss.every(x => x >= 2.0 && x <= 2.1), JSON.stringify(p5.ss));
  t('P5d 零原子碰撞（非键合 <0.8Å）', p5.ok && p5.clash === 0, JSON.stringify({ clash: p5.clash, minD: p5.minD }));
  t('P5e 键长合理（最长 ≤2.1Å）', p5.ok && p5.maxLen <= 2.1, JSON.stringify({ maxLen: p5.maxLen }));

  // ---------- P6 真实 UI：名称框「胰岛素」 ----------
  await page.evaluate(() => { window.__setInputPanelOpen(true); });
  await page.waitForTimeout(250);
  await page.fill('#name-input', '胰岛素');
  await page.click('#btn-molecule-from-input');
  await page.waitForFunction(() => {
    const el = document.getElementById('toast-message');
    return el && /已从名称生成: 胰岛素/.test(el.textContent || '');
  }, null, { timeout: 120000 });
  await page.waitForTimeout(600);
  const p6 = await page.evaluate(() => ({
    atoms: window.__diag.atomPositions().length,
    toast: (document.getElementById('toast-message') || {}).textContent || '',
    molName: (document.getElementById('molecule-name') || {}).textContent || '',
    formula: window.__statusBar ? window.__statusBar().formula : ''
  }));
  t('P6 UI 名称「胰岛素」走 PDB 路线（toast 含 PDB 3I40）', /PDB 3I40/.test(p6.toast), JSON.stringify(p6));
  t('P6b UI 生成 403 原子 · 分子名=胰岛素', p6.atoms === 403 && p6.molName === '胰岛素', JSON.stringify(p6));
  t('P6c 状态栏分子式 C256N65O76S6', p6.formula === 'C256N65O76S6', JSON.stringify(p6));

  // ---------- P7 序列框里填蛋白名同样命中 ----------
  await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(true));
  await page.waitForTimeout(250);
  await page.fill('#name-input', '');
  await page.fill('#seq-input', '溶菌酶');
  await page.click('#btn-molecule-from-input');
  await page.waitForFunction(() => {
    const el = document.getElementById('toast-message');
    return el && /已从名称生成: 溶菌酶/.test(el.textContent || '');
  }, null, { timeout: 120000 });
  await page.waitForTimeout(600);
  const p7 = await page.evaluate(() => ({
    atoms: window.__diag.atomPositions().length,
    toast: (document.getElementById('toast-message') || {}).textContent || ''
  }));
  t('P7 序列框输入「溶菌酶」也走 PDB 2LYZ', /PDB 2LYZ/.test(p7.toast) && p7.atoms === 1001, JSON.stringify(p7));
  await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(true));
  await page.waitForTimeout(250);
  await page.fill('#seq-input', '');
  await page.evaluate(() => window.__setInputPanelOpen && window.__setInputPanelOpen(false));

  // ---------- P8 多肽守卫 ----------
  const p8 = await page.evaluate(async () => {
    const pep = 'NCC(=O)NCC(=O)NCC(=O)NCC(=O)NCC(=O)NCC(=O)NCC(=O)NCC(=O)NCC(=O)NCC(=O)NCC(=O)O';
    const before = window.__diag.atomPositions().length;
    const bad = await window.__generateFromSmiles(pep);
    const afterBad = window.__diag.atomPositions().length;
    const small = await window.__generateFromSmiles('NCC(=O)NCC(=O)O');
    return {
      before, badOk: bad && bad.ok, badMsg: bad && bad.error ? bad.error.msg : '', afterBad,
      smallOk: small && small.ok, smallAtoms: small && small.atomCount
    };
  });
  t('P8 11 肽 SMILES 被守卫拒绝且不清空现有分子', p8.badOk === false && /酰胺键/.test(p8.badMsg) && p8.afterBad === p8.before, JSON.stringify(p8));
  t('P8b 小肽（2 个酰胺键）不被误拦', p8.smallOk === true && p8.smallAtoms > 0, JSON.stringify(p8));

  // ---------- P9 非法 PDB ID ----------
  const p9 = await page.evaluate(async () => {
    const a = await window.__fetchProteinPDBById('ZZZZ');
    const b = await window.__fetchProteinPDBById('0000');
    return { a, b };
  });
  t('P9 非法 PDB ID 返回错误不抛异常', p9.a && !p9.a.ok && /无效/.test(p9.a.error), JSON.stringify(p9.a));
  t('P9b 不存在的 PDB ID 返回 HTTP 错误', p9.b && !p9.b.ok && /HTTP 404/.test(p9.b.error), JSON.stringify(p9.b));

  // ---------- P10 33 例几何自测 ----------
  await page.evaluate(() => window.runAllExamplesAndTests());
  let results = null;
  try {
    await page.waitForFunction(() => window.lastRunResults && window.lastRunResults.results && window.lastRunResults.results.length === 33, null, { timeout: 600000 });
    results = await page.evaluate(() => {
      const r = window.lastRunResults.results;
      return { total: r.length, passed: r.filter(x => x.pass).length, failed: r.filter(x => !x.pass).map(x => x.name) };
    });
  } catch (e) {
    results = { total: 0, passed: 0, failed: ['timeout: ' + String(e).slice(0, 100)] };
  }
  t('P10 33 例几何自测全过', results && results.total === 33 && results.passed === 33, JSON.stringify(results));

  t('P11 零 console/page 错误', errs.length === 0, errs.join(' | '));

  out.durationMs = Date.now() - out.started;
  out.errors = errs;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  process.exit(out.fail ? 1 : 0);
})().catch(e => {
  out.fatal = String((e && e.stack) || e).slice(0, 1500);
  console.log(JSON.stringify(out, null, 1));
  process.exit(2);
});
