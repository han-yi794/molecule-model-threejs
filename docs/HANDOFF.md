# HANDOFF — 交接文档（分子建模器项目）

> 最后更新：2026-10-20（角落浮层点别处自动收起 + 孤对电子云改半透明浅蓝）
> **维护约定（用户长期要求）**：每完成一项任务后更新本文件，并随 `master` 提交、推送。
> 本文件**不进 gh-pages**（gh-pages 必须恰为 `index.html` + `README.md` 两文件，见 `AGENTS.md`「gh-pages 同步陷阱与正确姿势」）。

---

## 0. 项目速览

单文件 Three.js 分子建模应用，唯一主干文件 **`球棍模型4.html`**（约 2.4MB；内联 Three.js / SmilesDrawer / Lucide；无构建系统、无依赖清单；双击 `file://` 完全离线可用）。所有产品改动都在这一个文件里。

**权威文档是仓库根目录的 `AGENTS.md`**——功能细节、已知陷阱（必读）、几何优化关键函数、名称 / SMILES / 分子式输入管线、全部验证脚本矩阵、gh-pages 同步姿势都在那里。本文档只记录「当前状态」与「接手动作」，细节一律引用，不重复。

在线版：https://han-yi794.github.io/molecule-model-threejs/

## 1. 当前状态

- 分支策略：直接在 `master` 开发 / 提交 / 推送；`gh-pages` 只放发布产物。
- `master`：已推送（最近功能提交：角落浮层自动收起 + 孤对电子云浅蓝，本提交；上一功能提交 `c606406` 撤销/恢复配色对齐；更早提交见 `git log --oneline -8`）；`gh-pages` 本轮已同步至与 master 4.html / README 相同 blob（同步提交哈希见 `git log gh-pages -1`）；工作区干净（根目录遗留未跟踪的旧 `HANDOFF.md` 除外，删除与否待用户决定）。
- 杂项：过期的 `球棍模型4_PROGRESS.md`（2026-08 旧进度记录，内容已被 `AGENTS.md` 取代）已删除。
- **无进行中任务**。最近八项已交付（细节看提交信息 + `AGENTS.md` 对应条目）：
  1. `36c51d3` 删除 2 / 3 号副本；青蒿素名称生成修复（`ZH_NAME_FIX` + 精确 CID 优先 PubChem 3D）。
  2. `5326c01` 原子库精简（仅剩 8 张原子卡 + 提示）；分子式小键盘分区布局 + 移动端防溢出（`box-sizing` 陷阱）。
  3. `5ee33fd` 删除原子库「拖动方式」下拉（改右下角徽章单击循环 / Tab / Shift+Tab）；`verify_keypad_ui.js` 扩到 12 项。
  4. `27638c1` 内联 SVG 原子 favicon（零网络请求、file:// 离线可用）+ 标题简化为「球棍模型」；新增 `verify_favicon.js` 6/6。
  5. `c80ee28` 撤销 / 恢复（快照式历史栈 50 步）：左上角 undo/redo 按钮（Lucide 图标）+ Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y；覆盖生成/拖拽/删除/键改/旋转/优化/补氢/清空/微移（防抖合并），复合生成恰记一条；新增 `verify_history.js` 12/12；`verify_corners.js` 扩至 10/10（C2 含两新键 + C7b 移动端第二行）。
  6. 撤销 / 恢复按钮配色对齐（2026-10-19）：悬停青蓝 → 琥珀（同「全局同步优化」），空栈不再整体置灰（`.hist-empty` 保留为纯状态标记）——四个角落动作按钮观感完全一致；`verify_history.js` H1 增补空栈/悬停配色一致性断言（12/12），`verify_corners.js` 10/10。
  7. 角落下拉浮层点别处自动收起（2026-10-20，本提交）：`_collapseCornerDropdowns(target)`（document 捕获阶段 `mousedown`/`touchstart`）——「使用说明 / 设置 / 名称·SMILES」三面板 + `#formula-keypad` 小键盘，点面板外任意处自动收起；语义为**手风琴**（同时只展开一个）；点面板内部保持展开。小键盘是 `#input-panel` 之外的独立 DOM，判定时须一并算作"面板内部"，且 `#formula-input`/`#btn-open-keypad` 须排除（否则开关按钮永远关不掉）。原生 `<select>` 的"点别处收起"是既有行为（blur），未改。新增 `verify_dropdown_autoclose.js` 11/11；`verify_corners.js` C3/C5 与 `verify_icons.js` I5 按手风琴语义更新（10/10、8/8）。
  8. 孤对电子云改半透明浅蓝（2026-10-20，本提交，用户需求）：`LP_COLOR` `0x00e0ff`（青）→ `0x9fd0ff`（浅蓝）、`LP_OPACITY` `0.30` → `0.72`（深色背景下 α 太低显灰暗，实测合成色 RGB(117,153,187)，仍可透出下层原子）；云内电子点仍为黑色。新增 `verify_lone_pairs.js` 8/8（颜色/透明度/显隐开关/甲胺 N/苯零云/浅蓝色值/零 console）；探针发现预置示例生成器不刷新孤对（需 toggle 一次才出云），已记入 AGENTS 陷阱。
- 回归基线（最近一次全绿）：`verify_history` 12/12 · `verify_corners` 10/10 · `verify_icons` 8/8 · `verify_dropdown_autoclose` 11/11 · `verify_lone_pairs` 8/8 · `verify_keypad_ui` 12/12 · `verify_foolproof` 22/22 · `verify_delete_icon` 5/5 · `verify_ui_clear_help` ×2 · `verify_group_drag_label` 5/5 · `verify_guide_panel` 6/6 · `verify_autoH` 8/8（expected==got）· `verify_layout_move` 7/7 · `verify_ui_input` 7/7 · 33 几何自测 33/33（`playwright-verify.js`）。

## 2. 接手动作清单

1. 先读 `AGENTS.md`（至少「运行与验证」「已知陷阱（必读）」两节）。
2. 起静态服务器：仓库根目录 `python -m http.server 8000`。
3. 改动后跑相关验证脚本：`cmd /c "node verify_x.js > _run_x.json 2>&1"`，timeout 恒 900000ms（PowerShell 直接重定向会损坏 JSON，必须走 cmd）。
4. 自测完成判定：轮询 `window.lastRunResults.results.length === 33`（首屏不自动跑测试）；勿用 `__AUTOTEST_DONE__`（陷阱见 AGENTS.md）。
5. 收尾三件事：**更新本 HANDOFF** → 提交推送 `master` → 若动了 `球棍模型4.html` / `README.md` 再按 AGENTS.md 的 plumbing 法同步 gh-pages 并做三项校验（恰 2 文件 / `index.html` blob == master 4.html blob / README diff 0 行）。

## 3. 发布流程（速记，完整版见 AGENTS.md）

- 同步工具（位于 `%TEMP%\opencode\`，可能已被系统清理，可按 AGENTS.md 步骤重建）：`ghp_sync.js`（plumbing 法同步）、`ghp_check.js`（推送后校验）。
- 铁律：gh-pages 上**绝不 `git add -A`**（2026-10 事故：误提交 188 个本地文件，随后 checkout 把工作区文件清光）；一律用临时 `GIT_INDEX_FILE` + `commit-tree` 的 plumbing 法。

## 4. 遗留 / 待办

见 `AGENTS.md`「待办需求」节（胰岛素等蛋白大分子的 SMILES 路线缺口、血红素 Fe 配位、SMILES 本地管线无支链烷烃头部塌缩缺陷未修）。不在此重复。

## 5. Suggested skills（建议按需加载）

| 技能 | 何时使用 |
| --- | --- |
| `handoff` | 每完成一项任务后更新本文件（用户长期要求） |
| `writing-for-agents` | 修改 `AGENTS.md` / 本文件时（保持给 agent 的指令有效、精简） |
| `browser-automation` | 对 `球棍模型4.html` 做 Playwright 真实鼠标 / UI 验证时 |
| `diagnosing-bugs` | 几何不收敛、回归失败等硬 bug 排查（配合 `node probe_trace.js <seed> <example>` 单例复现） |
| `docs-generator` | 用户要求出正式报告 / writeup 时 |
