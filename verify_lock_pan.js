// 验证：去雾 / 场景平移 / 分子结构锁（2026-11）
// 运行：node verify_lock_pan.js > verifyLockPan.json 2>&1
const { chromium } = require('playwright-core');

const URL = 'http://127.0.0.1:8000/%E7%90%83%E6%A3%8D%E6%A8%A1%E5%9E%8B4.html?noauto=1';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  // 干净的初始状态（不持久化上次运行的锁）
  await page.evaluate(() => { try { localStorage.removeItem('MOLECULE_LOCKED'); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const canvasBox = await page.locator('canvas[data-engine]').boundingBox();
  const cx = canvasBox.x + canvasBox.width / 2;
  const cy = canvasBox.y + canvasBox.height / 2;

  // ---------- A. 雾气 / 平移 ----------
  const fog = await page.evaluate(() => window.__diag.fogInfo());
  check('A1 场景无雾气', fog === null, fog);

  const panCfg = await page.evaluate(() => window.__diag.panConfig());
  check('A2 平移配置（enablePan + 右键 PAN）',
    panCfg.enablePan === true && panCfg.right === 2 && panCfg.left === 0 && panCfg.middle === 1, panCfg);

  // 右键拖 = 平移
  const t0 = await page.evaluate(() => window.__diag.camInfo().target);
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(cx + 120, cy + 60, { steps: 12 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(500);
  const t1 = await page.evaluate(() => window.__diag.camInfo().target);
  check('A3 右键拖平移（target 改变）', JSON.stringify(t0) !== JSON.stringify(t1), { t0, t1 });

  // Shift + 左键拖 = 平移
  await page.keyboard.down('Shift');
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(cx - 100, cy - 50, { steps: 12 });
  await page.mouse.up({ button: 'left' });
  await page.keyboard.up('Shift');
  await page.waitForTimeout(500);
  const t2 = await page.evaluate(() => window.__diag.camInfo().target);
  const shiftPanAfter = await page.evaluate(() => window.__diag.panConfig());
  check('A4 Shift+左键拖平移（target 改变 + 松手恢复旋转）',
    JSON.stringify(t1) !== JSON.stringify(t2) && shiftPanAfter.shiftPan === false && shiftPanAfter.left === 0, { t1, t2, shiftPanAfter });

  // 生成苯环（解锁状态），供后续锁定测试
  await page.evaluate(() => window.__diag.generate('benzene'));
  await page.waitForTimeout(800);
  const atomCount0 = await page.evaluate(() => window.__dragMode.atoms().length);
  check('A5 苯环生成', atomCount0 === 12, { atomCount0 });

  // ---------- B. 锁定开关 UI ----------
  const s0 = await page.evaluate(() => window.__moleculeLock.state());
  check('B1 默认未锁定（图标 lock-open / 状态条隐藏）',
    s0.locked === false && s0.icon === 'lock-open' && s0.pressed === 'false' && s0.bodyClass === false && s0.statVisible === false, s0);

  await page.click('#btn-lock-molecule');
  await page.waitForTimeout(250);
  const s1 = await page.evaluate(() => ({
    state: window.__moleculeLock.state(),
    ls: (() => { try { return localStorage.getItem('MOLECULE_LOCKED'); } catch (e) { return null; } })(),
    statText: (document.querySelector('#stat-lock .stat-val') || {}).textContent || null,
    btnColor: getComputedStyle(document.getElementById('btn-lock-molecule')).color
  }));
  check('B2 点击锁定：图标 lock / aria / 状态条 / body 类 / 持久化',
    s1.state.locked === true && s1.state.icon === 'lock' && s1.state.pressed === 'true' &&
    s1.state.bodyClass === true && s1.state.statVisible === true && s1.ls === '1' && s1.statText === '已锁定',
    s1);

  // 锁定后选中原子：无 gizmo / 无删除图标
  await page.evaluate(() => window.__dragMode.selectFirstAtom());
  await page.waitForTimeout(400);
  const s2 = await page.evaluate(() => window.__moleculeLock.state());
  check('B3 锁定时选中原子不出现 gizmo / 删除图标',
    s2.locked === true && s2.gizmoVisible === false && s2.deleteIcon === false, s2);

  // ---------- C. 锁定时结构不可改 ----------
  const posBefore = await page.evaluate(() => window.__diag.atomPositions());
  const atomScreen = await page.evaluate(() => {
    const a = window.__diag.atomPositions().find(x => x.type === 'C');
    return window.__dragMode.project(a.x, a.y, a.z);
  });
  await page.mouse.move(atomScreen.x, atomScreen.y);
  await page.mouse.down();
  await page.mouse.move(atomScreen.x + 90, atomScreen.y + 45, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const posAfterDrag = await page.evaluate(() => window.__diag.atomPositions());
  const toast1 = await page.evaluate(() => document.getElementById('toast-message').textContent);
  check('C1 锁定后拖原子无效 + 提示',
    JSON.stringify(posBefore) === JSON.stringify(posAfterDrag) && /锁定/.test(toast1) && /拖动原子/.test(toast1),
    { toast1, moved: JSON.stringify(posBefore) !== JSON.stringify(posAfterDrag) });

  // 再拖一次：once 提示不刷屏（toast 文案不变）
  await page.mouse.move(atomScreen.x, atomScreen.y);
  await page.mouse.down();
  await page.mouse.move(atomScreen.x + 60, atomScreen.y - 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const toast2 = await page.evaluate(() => document.getElementById('toast-message').textContent);
  check('C2 拖动提示只弹一次（once）', toast1 === toast2, { toast1, toast2 });

  // 锁定后点击键：不弹键级菜单
  const bondPointLocked = await page.evaluate(() => {
    const pts = window.__diag.atomPositions();
    const pr = pts.map(p => window.__dragMode.project(p.x, p.y, p.z));
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const x = (pr[i].x + pr[j].x) / 2, y = (pr[i].y + pr[j].y) / 2;
        const p = window.__dragMode.pickAt(x, y);
        if (p && p.kind === 'bond') return { x, y, bond: p };
      }
    }
    return null;
  });
  await page.mouse.click(bondPointLocked.x, bondPointLocked.y);
  await page.waitForTimeout(300);
  const lockedBondState = await page.evaluate(() => ({
    menu: getComputedStyle(document.getElementById('bond-type-menu')).display,
    selected: window.__dragMode.selectedBond()
  }));
  check('C3 锁定时点击键不弹键级菜单（仍可选中查看）',
    lockedBondState.menu === 'none' && !!lockedBondState.selected,
    { bondPointLocked, lockedBondState });

  // 锁定后 Delete / 优化 / 撤销 / 清空 / 生成 全部被拒
  const nBefore = await page.evaluate(() => window.__dragMode.atoms().length);
  await page.evaluate(() => window.__dragMode.selectFirstAtom());
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  const nAfterDelete = await page.evaluate(() => window.__dragMode.atoms().length);
  const toastDelete = await page.evaluate(() => document.getElementById('toast-message').textContent);
  check('C4 锁定后 Delete 不删原子', nBefore === nAfterDelete && /删除原子/.test(toastDelete), { nBefore, nAfterDelete, toastDelete });

  await page.click('#btn-optimize-all');
  await page.waitForTimeout(300);
  const toastOpt = await page.evaluate(() => document.getElementById('toast-message').textContent);
  check('C5 锁定后优化被拒', /优化结构/.test(toastOpt), { toastOpt });

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  const toastUndo = await page.evaluate(() => document.getElementById('toast-message').textContent);
  check('C6 锁定后撤销被拒', /撤销/.test(toastUndo), { toastUndo });

  await page.click('#btn-clear-molecule');
  await page.waitForTimeout(300);
  const nAfterClear = await page.evaluate(() => window.__dragMode.atoms().length);
  const toastClear = await page.evaluate(() => document.getElementById('toast-message').textContent);
  check('C7 锁定后清空被拒', nAfterClear === nBefore && /清空画布/.test(toastClear), { nAfterClear, toastClear });

  // 生成新分子被拒
  await page.evaluate(() => window.__setInputPanelOpen(true));
  await page.waitForTimeout(350);
  await page.fill('#name-input', 'ethane');
  await page.click('#btn-molecule-from-input');
  await page.waitForTimeout(400);
  const toastGen = await page.evaluate(() => document.getElementById('toast-message').textContent);
  const nAfterGen = await page.evaluate(() => window.__dragMode.atoms().length);
  check('C8 锁定后生成新分子被拒', nAfterGen === nBefore && /生成新分子/.test(toastGen), { nAfterGen, toastGen });
  await page.evaluate(() => window.__setInputPanelOpen(false));
  await page.waitForTimeout(300);

  // 锁定后从侧栏拖原子/基团无效
  await page.evaluate(() => window.__buildLib.set('atoms'));
  await page.waitForTimeout(200);
  const cardBox = await page.locator('#drag-carbon').boundingBox();
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cx, cy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const nAfterAtomDrag = await page.evaluate(() => window.__dragMode.atoms().length);
  const toastAtomDrag = await page.evaluate(() => document.getElementById('toast-message').textContent);
  check('C9 锁定后从元素库拖原子无效', nAfterAtomDrag === nBefore && /添加原子/.test(toastAtomDrag), { nAfterAtomDrag, toastAtomDrag });

  await page.evaluate(() => window.__buildLib.set('groups'));
  await page.waitForTimeout(200);
  const gBox = await page.locator('.group-card').first().boundingBox();
  await page.mouse.move(gBox.x + gBox.width / 2, gBox.y + gBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cx, cy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const nAfterGroupDrag = await page.evaluate(() => window.__dragMode.atoms().length);
  const toastGroupDrag = await page.evaluate(() => document.getElementById('toast-message').textContent);
  check('C10 锁定后从基团库拖基团无效', nAfterGroupDrag === nBefore && /添加基团/.test(toastGroupDrag), { nAfterGroupDrag, toastGroupDrag });

  // 锁定不影响视角：左键拖空白旋转
  const camBefore = await page.evaluate(() => window.__diag.camInfo().pos);
  await page.mouse.move(cx - 200, cy + 150);
  await page.mouse.down();
  await page.mouse.move(cx - 120, cy + 90, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const camAfter = await page.evaluate(() => window.__diag.camInfo().pos);
  check('C11 锁定后视角仍可旋转', JSON.stringify(camBefore) !== JSON.stringify(camAfter), { camBefore, camAfter });

  // ---------- D. 解锁 ----------
  await page.keyboard.press('l');
  await page.waitForTimeout(300);
  const s3 = await page.evaluate(() => ({
    state: window.__moleculeLock.state(),
    ls: (() => { try { return localStorage.getItem('MOLECULE_LOCKED'); } catch (e) { return null; } })()
  }));
  check('D1 快捷键 L 解锁（图标/状态条/持久化）',
    s3.state.locked === false && s3.state.icon === 'lock-open' && s3.state.statVisible === false &&
    s3.state.bodyClass === false && s3.ls === '0', s3);

  // 解锁后拖原子有效
  const posUnlockedBefore = await page.evaluate(() => window.__diag.atomPositions());
  await page.mouse.move(atomScreen.x, atomScreen.y);
  await page.mouse.down();
  await page.mouse.move(atomScreen.x + 90, atomScreen.y + 45, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const posUnlockedAfter = await page.evaluate(() => window.__diag.atomPositions());
  check('D2 解锁后拖原子有效', JSON.stringify(posUnlockedBefore) !== JSON.stringify(posUnlockedAfter),
    { moved: JSON.stringify(posUnlockedBefore) !== JSON.stringify(posUnlockedAfter) });

  // 解锁后键菜单恢复（用丁烷的单键，后续可进入单键旋转）
  await page.evaluate(() => window.__diag.generate('butane'));
  await page.waitForTimeout(800);
  const bondPointUnlocked = await page.evaluate(() => {
    const pts = window.__diag.atomPositions();
    const pr = pts.map(p => window.__dragMode.project(p.x, p.y, p.z));
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const x = (pr[i].x + pr[j].x) / 2, y = (pr[i].y + pr[j].y) / 2;
        const p = window.__dragMode.pickAt(x, y);
        if (p && p.kind === 'bond') return { x, y, bond: p };
      }
    }
    return null;
  });
  await page.mouse.click(bondPointUnlocked.x, bondPointUnlocked.y);
  await page.waitForTimeout(350);
  const unlockedBondState = await page.evaluate(() => ({
    menu: getComputedStyle(document.getElementById('bond-type-menu')).display,
    selected: window.__dragMode.selectedBond()
  }));
  check('D3 解锁后键菜单恢复', unlockedBondState.menu !== 'none' && !!unlockedBondState.selected,
    { bondPointUnlocked, unlockedBondState });

  // 锁定会关闭已打开的键菜单 + 退出单键旋转
  await page.evaluate((id) => { window.__torsion.setPivot(id); }, unlockedBondState.selected.a);
  await page.waitForTimeout(300);
  const torsionBeforeLock = await page.evaluate(() => ({ active: window.__torsion.active(), axis: window.__torsion.axisVisible() }));
  await page.keyboard.press('l');
  await page.waitForTimeout(300);
  const afterLock = await page.evaluate(() => ({
    menu: getComputedStyle(document.getElementById('bond-type-menu')).display,
    active: window.__torsion.active(),
    axis: window.__torsion.axisVisible(),
    locked: window.__moleculeLock.state().locked
  }));
  check('D4 锁定自动关闭键菜单并退出单键旋转',
    torsionBeforeLock.active === true && afterLock.locked === true && afterLock.menu === 'none' && afterLock.active === false && afterLock.axis === false,
    { torsionBeforeLock, afterLock });

  // ---------- E. 持久化（刷新后仍锁定） ----------
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const persisted = await page.evaluate(() => ({
    state: window.__moleculeLock.state(),
    ls: (() => { try { return localStorage.getItem('MOLECULE_LOCKED'); } catch (e) { return null; } })()
  }));
  check('E1 刷新后保持锁定', persisted.state.locked === true && persisted.state.icon === 'lock' &&
    persisted.state.statVisible === true && persisted.ls === '1', persisted);

  // 解锁后刷新保持未锁定
  await page.keyboard.press('l');
  await page.waitForTimeout(250);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const persisted2 = await page.evaluate(() => ({
    state: window.__moleculeLock.state(),
    ls: (() => { try { return localStorage.getItem('MOLECULE_LOCKED'); } catch (e) { return null; } })()
  }));
  check('E2 解锁后刷新保持未锁定', persisted2.state.locked === false && persisted2.ls === '0', persisted2);

  // ---------- F. 触摸端：锁定时点键不弹菜单 ----------
  const touchPage = await browser.newPage({ viewport: { width: 900, height: 700 }, hasTouch: true, isMobile: true });
  touchPage.on('pageerror', e => errors.push('touch pageerror: ' + e.message));
  touchPage.on('console', m => { if (m.type() === 'error') errors.push('touch console: ' + m.text()); });
  await touchPage.goto(URL, { waitUntil: 'load' });
  await touchPage.waitForTimeout(1200);
  await touchPage.evaluate(() => window.__diag.generate('benzene'));
  await touchPage.waitForTimeout(800);
  await touchPage.evaluate(() => window.__moleculeLock.set(true));
  await touchPage.waitForTimeout(200);
  const touchMid = await touchPage.evaluate(() => {
    const a = window.__diag.atomPositions();
    const p1 = window.__dragMode.project(a[0].x, a[0].y, a[0].z);
    const p2 = window.__dragMode.project(a[1].x, a[1].y, a[1].z);
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  });
  await touchPage.touchscreen.tap(touchMid.x, touchMid.y);
  await touchPage.waitForTimeout(400);
  const touchMenu = await touchPage.evaluate(() => getComputedStyle(document.getElementById('bond-type-menu')).display);
  const touchN = await touchPage.evaluate(() => window.__dragMode.atoms().length);
  check('F1 触摸锁定点键不弹菜单', touchMenu === 'none' && touchN === 12, { touchMenu, touchN });
  await touchPage.close();

  // ---------- G. 零 console 错误 ----------
  check('G1 零 console / pageerror', errors.length === 0, errors.slice(0, 8));

  const pass = results.filter(r => r.ok).length;
  console.log(`\n===== ${pass}/${results.length} passed =====`);
  const fs = require('fs');
  fs.writeFileSync('verifyLockPan.json', JSON.stringify({ pass, total: results.length, results, errors }, null, 2));
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => {
  console.log('FATAL', e && e.stack || e);
  process.exit(2);
});
