// 验证 PubChem 3D 坐标直接生成（名称/SMILES → 3D SDF → 按坐标生成）
// 运行：cmd /c "node verify_3d.js > verify3d.json 2>&1"
const { chromium } = require('playwright');

(async () => {
  const out = { name: 'verify_3d', started: Date.now(), tests: [], pass: 0, fail: 0, errors: [] };
  const t = (name, cond, detail) => { out.tests.push({ name, pass: !!cond, detail: detail || '' }); if (cond) out.pass++; else out.fail++; };
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));

  await page.goto('http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1&v=3d6', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__generateFrom3D && window.__fetchPubChem3D && window.__resolveNameToSmiles, null, { timeout: 15000 });

  const cntByType = () => {
    const cnt = {};
    window.__diag.atomPositions().forEach(a => { cnt[a.type] = (cnt[a.type] || 0) + 1; });
    return cnt;
  };

  // 1. SDF 解析单元（构造一个 2 原子甲烷 SDF）
  const parseTest = await page.evaluate(() => {
    const sdf = ['methane', '  -OEChem-...', '', '  2  1  0     0  0  0  0  0  0999 V2000',
      '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
      '    1.0900    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0',
      '  1  2  1  0  0  0  0', 'M  END', ''].join('\n');
    const r = window.__parseSDF3D(sdf);
    return r ? { nAtoms: r.atoms.length, nBonds: r.bonds.length, t0: r.atoms[0].type, t1: r.atoms[1].type, x1: +r.atoms[1].pos.x.toFixed(3), bo: r.bonds[0][2] } : null;
  });
  t('parseSDF3D 解析甲烷', !!parseTest && parseTest.nAtoms === 2 && parseTest.nBonds === 1 && parseTest.t0 === 'C' && parseTest.t1 === 'H' && parseTest.x1 === 1.09 && parseTest.bo === 1, JSON.stringify(parseTest));

  // 2. 名称 → PubChem 3D 直接生成：青蒿素应为 42 原子（C15H22O5，含 22 H）
  const qh = await page.evaluate(async () => {
    const r = await window.__resolveNameToSmiles('青蒿素');
    if (!r || !r.smiles || !r.cid) return { r };
    const struct = await window.__fetchPubChem3D('cid', r.cid);
    if (!struct) return { r, struct: null };
    const n = window.__generateFrom3D(struct);
    const cnt = {};
    window.__diag.atomPositions().forEach(a => { cnt[a.type] = (cnt[a.type] || 0) + 1; });
    return { r, struct: { nAtoms: struct.atoms.length, nBonds: struct.bonds.length }, n, cnt };
  });
  t('青蒿素解析含 cid', !!(qh && qh.r && qh.r.cid), JSON.stringify(qh && qh.r));
  t('青蒿素 3D SDF 42 原子 45 键', !!(qh && qh.struct && qh.struct.nAtoms === 42 && qh.struct.nBonds === 45), JSON.stringify(qh && qh.struct));
  t('青蒿素生成 42 原子（15C+5O+22H）', !!(qh && qh.n === 42 && qh.cnt && qh.cnt.C === 15 && qh.cnt.O === 5 && qh.cnt.H === 22), JSON.stringify(qh && { n: qh.n, cnt: qh.cnt }));

  // 3. 3D 几何质量：键长分布（C-C 单键≈1.5-1.56，C=O≈1.2-1.25，O-O 过氧≈1.45-1.5）
  const geom = await page.evaluate(() => {
    const bonds = window.__diag.bonds();
    const lens = bonds.map(b => ({ t: b.types.join('-'), o: b.type, l: b.len }));
    const cc = lens.filter(l => l.t === 'C-C' && l.o === 1).map(l => +l.l.toFixed(3));
    const co = lens.filter(l => (l.t === 'C-O' || l.t === 'O-C') && l.o === 2).map(l => +l.l.toFixed(3));
    const oo = lens.filter(l => l.t === 'O-O' && l.o === 1).map(l => +l.l.toFixed(3));
    return { cc, co, oo, nBonds: lens.length };
  });
  t('3D 键长合理（C-C 1.48-1.57、C=O 1.18-1.26、O-O 1.43-1.53）', !!geom && geom.cc.length > 0 && geom.cc.every(l => l >= 1.48 && l <= 1.57) && geom.co.every(l => l >= 1.18 && l <= 1.26) && geom.oo.length > 0 && geom.oo.every(l => l >= 1.43 && l <= 1.53), JSON.stringify(geom));

  // 4. SMILES 输入 → 3D 生成（阿司匹林 C9H8O4 = 21 原子）
  const sm = await page.evaluate(async () => {
    const struct = await window.__fetchPubChem3D('smiles', 'CC(=O)Oc1ccccc1C(=O)O');
    if (!struct) return { struct: null };
    const n = window.__generateFrom3D(struct);
    const cnt = {};
    window.__diag.atomPositions().forEach(a => { cnt[a.type] = (cnt[a.type] || 0) + 1; });
    return { n, cnt, nBonds: struct.bonds.length };
  });
  t('SMILES 3D 生成阿司匹林 21 原子（9C+4O+8H）', !!(sm && sm.n === 21 && sm.cnt && sm.cnt.C === 9 && sm.cnt.O === 4 && sm.cnt.H === 8), JSON.stringify(sm));

  // 5. 回退：本地管线不崩（generateFromSmiles 应仍工作）
  const fb = await page.evaluate(async () => {
    const res = await window.__generateFromSmiles('CCO');
    return res && res.ok ? res.atomCount : (res && res.error ? 'ERR:' + res.error.msg : 'NO_RES');
  });
  t('本地管线回退 CCO → 9 原子', fb === 9, String(fb));

  // 6. UI 路径：名称框输入青蒿素 → 生成 42 原子
  await page.evaluate(() => {
    document.getElementById('name-input').value = '青蒿素';
    document.getElementById('smiles-input').value = '';
    window.__generateFromInput();
  });
  await page.waitForTimeout(4000);
  const uiState = await page.evaluate(() => {
    const cnt = {};
    window.__diag.atomPositions().forEach(a => { cnt[a.type] = (cnt[a.type] || 0) + 1; });
    return { n: window.__diag.atomPositions().length, cnt };
  });
  t('UI 名称→3D 生成 42 原子', uiState.n === 42 && uiState.cnt.H === 22, JSON.stringify(uiState));

  out.errors = errs;
  out.done = Date.now();
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });