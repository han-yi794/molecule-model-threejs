# 球棍模型4.html 进度(2026-08-09 更新)

## ✅ 本轮完成(键角修复 + 一键补氢 + 双键 bug 修复)
- **基团键角 bug 全修复**:
  - 乙基:C3 原本放在 (1.54,0,0) 使 C-C-C = 180°(sp3 应为 109.47°)→ 改为四面体正确坐标(0.513,0,1.452),锚 C 全部键角 109.3-109.6°。
  - 苯基:H6 坐标原为 (0.155,0,-0.268) 指向环内 → 修正 (0.155,0,-2.156) 环外(与 C2/C4/C5 的 H 对称)。
  - 羰基:C=O 原在 90° → 改 120°(与醛/酯/羧基 O 位置一致)。
  - methyl/amino/carboxyl/aldehyde/ester 复核无问题。
- **一键补氢(可开关)**:按钮 `btn-toggle-hydro`(localStorage.HYDROGENATE_AUTO 持久化,默认关)。开启后"全局同步优化"先补 H 再优化。VSEPR 缺价规则 + 方向贪心。8 个语义案例全对(丙烷骨架+8/乙烯+4/乙炔+2/苯骨架+6/甲醇+4/甲胺+5/完整分子+0),补氢后苯环键角 std 全 0。
- **超价双键 bug 修复**(用户报告:甲酸 C=O 中点放 H/Cl,同时连 C 和 O 两条键):
  - 根因:updateBonds 加键分支的 `canAddBond(a,b,1,newBonds)`,其 `getAtomBondOrderSum` 把 `newBonds`(含本轮 existing 键)重复计数 → C 的 σ 被算成 6,导致 **所有** 新键被误拒(甲酸中点 H 连一条都不成);在此之前旧版 `extraBonds` 仅含新增候选(O-H 先建后 H 满价拒 C-H,或反之,总 2 条同时存在——两侧的 ordering 造成双键)。
  - 修复:`getAtomBondOrderSum` 的 extraBonds 循环跳过 `bonds.includes(bond)` 的已存在键 → 计数正确:C-H 键建成(midpoint H 只连 C 1 条),O-H 因 H 已达价被拒。
  - 验证 verify_duplicate_bond.js:甲酸中点 H→1 条 C-H、Cl→1 条 C-Cl、苯邻位中点 H→1 条、乙烷端 H→0(已满价);全部如预期。
- **回归全绿**:33 几何 33/33 + 23 π 23/23(3 个文件)+ 36 吸附场景(9 组×4)+ 8 补氢案例 + 0 控制台错误。
- **isOptimizing 卡死修复(有时残留键/无法新建键)**:
  - 根因:`optimizeSingleAtom()` 在 `isOptimizing = true` 后若 `getIdealDirections` 返回不符(2298 提前 `return false`)→ isOptimizing 永久卡 true → 此后所有 `updateBonds()` 走 else 分支"只更新几何不重建键列表",删除/移除的键 cyllinders 与 bonds 数组脱节 = 残留键;`optimizeAllAtoms()` 循环内也无 try/finally,异常同理卡死。
  - 修复:①2998 提前退出前复位 `isOptimizing = false`;②`optimizeAllAtoms()` 整体包 try/finally(异常/提前退出必复位 + 更新 lastOptimizationEndTime);③`clearMolecule()` 开头兜底强制复位 isOptimizing。
  - 验证:9 分子 × (生成→扰动→优化→补氢→再优化→清空×2→等待 500ms) 全流程 cylCount/bondCount/orphanCount 全 0;回归全绿(33/33+23/23×2、36 场景、8 补氢、4 双键)。
  - 新增调试:`window.__diag.residual()` 返回 {cylCount(场景 CylinderGeometry 数), bondCount, orphanCount(键两端不在场景的孤儿键)}。
- **Shift+O 无法一键补氢修复**:
  - 根因:补氢逻辑只挂在 `btn-optimize-all` 按钮 click 里,`Shift+O` 快捷键(keydown)直接调 `optimizeAllAtoms()`,开启了自动补氢也不会补。
  - 修复:抽公共入口 `optimizeAllWithAutoHydrogen()`(开启时先 `addMissingHydrogens()` 再 `optimizeAllAtoms()`),按钮 click 与 Shift+O keydown 都经它。
  - 验证:Shift+O+补氢开 → 丙烷骨架 +8 H;补氢关 → 不补;按钮路径乙烷 +6 H 回归正常;33/23×2 全绿。

## 验证方法
- 基团: `http://127.0.0.1:8000/球棍模型4.html?noauto=1` + `window.__diag.generateSpec('benzene')` / `__diag.runOpt()` / `__createCompleteGroup(k,p)` / `__diag.angleDiag()`(验证脚本 verify_groups_fix.js / verify_regression.js)
- 补氢: `__createHeavyAtom` / `__manualBond` 搭骨架 → `__addMissingHydrogens()` → count(verify_autoH.js)
- 双键复现/防回归: verify_duplicate_bond.js(甲酸 C=O 中点 H/Cl、苯中点、乙烷端)