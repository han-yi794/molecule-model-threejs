# HANDOFF — 交接文档（分子建模器项目）

> 最后更新：2026-10-25（浮层开合动画：角落面板手风琴 + 弹窗淡入淡出）
> **维护约定（用户长期要求）**：每完成一项任务后更新本文件，并随 `master` 提交、推送。
> 本文件**不进 gh-pages**（gh-pages 必须恰为 `index.html` + `README.md` 两文件，见 `AGENTS.md`「gh-pages 同步陷阱与正确姿势」）。

---

## 0. 项目速览

单文件 Three.js 分子建模应用，唯一主干文件 **`球棍模型4.html`**（约 2.4MB；内联 Three.js / SmilesDrawer / Lucide；无构建系统、无依赖清单；双击 `file://` 完全离线可用）。所有产品改动都在这一个文件里。

**权威文档是仓库根目录的 `AGENTS.md`**——功能细节、已知陷阱（必读）、几何优化关键函数、名称 / SMILES / 分子式输入管线、全部验证脚本矩阵、gh-pages 同步姿势都在那里。本文档只记录「当前状态」与「接手动作」，细节一律引用，不重复。

在线版：https://han-yi794.github.io/molecule-model-threejs/

## 1. 当前状态

- 分支策略：直接在 `master` 开发 / 提交 / 推送；`gh-pages` 只放发布产物。
- `master`：已推送（最近功能提交：浮层开合动画，本提交；上一提交 `7022139` 大分子式检索前筛选 + 修复「请求失败」、`fb6b22e` 两侧栏可折叠收起、`a8132ea` 孤对电子云更深蓝 + 受光立体；更早 `620529a` 电子点改黑色（黑铬）、`675b5cd` 电子点金属材质（银灰）、`0f663e5` 孤对电子云改水滴形，其余见 `git log --oneline -10`）；`gh-pages` 本轮已同步至与 master 4.html / README 相同 blob（同步提交哈希见 `git log gh-pages -1`）；工作区干净（根目录遗留未跟踪的旧 `HANDOFF.md` 除外，删除与否待用户决定）。
- 杂项：过期的 `球棍模型4_PROGRESS.md`（2026-08 旧进度记录，内容已被 `AGENTS.md` 取代）已删除。
- **无进行中任务**。最近十项已交付（细节看提交信息 + `AGENTS.md` 对应条目）：
  1. `36c51d3` 删除 2 / 3 号副本；青蒿素名称生成修复（`ZH_NAME_FIX` + 精确 CID 优先 PubChem 3D）。
  2. `5326c01` 原子库精简（仅剩 8 张原子卡 + 提示）；分子式小键盘分区布局 + 移动端防溢出（`box-sizing` 陷阱）。
  3. `5ee33fd` 删除原子库「拖动方式」下拉（改右下角徽章单击循环 / Tab / Shift+Tab）；`verify_keypad_ui.js` 扩到 12 项。
  4. `27638c1` 内联 SVG 原子 favicon（零网络请求、file:// 离线可用）+ 标题简化为「球棍模型」；新增 `verify_favicon.js` 6/6。
  5. `c80ee28` 撤销 / 恢复（快照式历史栈 50 步）：左上角 undo/redo 按钮（Lucide 图标）+ Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y；覆盖生成/拖拽/删除/键改/旋转/优化/补氢/清空/微移（防抖合并），复合生成恰记一条；新增 `verify_history.js` 12/12；`verify_corners.js` 扩至 10/10（C2 含两新键 + C7b 移动端第二行）。
  6. 撤销 / 恢复按钮配色对齐（2026-10-19）：悬停青蓝 → 琥珀（同「全局同步优化」），空栈不再整体置灰（`.hist-empty` 保留为纯状态标记）——四个角落动作按钮观感完全一致；`verify_history.js` H1 增补空栈/悬停配色一致性断言（12/12），`verify_corners.js` 10/10。
  7. 角落下拉浮层点别处自动收起（2026-10-20，本提交）：`_collapseCornerDropdowns(target)`（document 捕获阶段 `mousedown`/`touchstart`）——「使用说明 / 设置 / 名称·SMILES」三面板 + `#formula-keypad` 小键盘，点面板外任意处自动收起；语义为**手风琴**（同时只展开一个）；点面板内部保持展开。小键盘是 `#input-panel` 之外的独立 DOM，判定时须一并算作"面板内部"，且 `#formula-input`/`#btn-open-keypad` 须排除（否则开关按钮永远关不掉）。原生 `<select>` 的"点别处收起"是既有行为（blur），未改。新增 `verify_dropdown_autoclose.js` 11/11；`verify_corners.js` C3/C5 与 `verify_icons.js` I5 按手风琴语义更新（10/10、8/8）。
  8. 孤对电子云改半透明浅蓝（2026-10-20，本提交，用户需求）：`LP_COLOR` `0x00e0ff`（青）→ `0x9fd0ff`（浅蓝）、`LP_OPACITY` `0.30` → `0.72`（深色背景下 α 太低显灰暗，实测合成色 RGB(117,153,187)，仍可透出下层原子）；云内电子点仍为黑色。新增 `verify_lone_pairs.js` 8/8（颜色/透明度/显隐开关/甲胺 N/苯零云/浅蓝色值/零 console）；探针发现预置示例生成器不刷新孤对（需 toggle 一次才出云），已记入 AGENTS 陷阱。
  9. 孤对电子云改水滴形（2026-10-21，本提交，用户需求「形状改成水滴形，参考 nobook H₂O 页面」）：椭球云（`SphereGeometry(LP_RADIUS=0.42)` 缩放 1.08/1.4/1.08、云心固定距原子 0.78）→ `createLonePairDropGeometry()` 顶点变形（球面径向 × v^k 再归一化；`LP_DROP_LEN=1.28`、`LP_DROP_RADIUS=0.40`、`LP_DROP_TAPER=0.5` → 轮廓 r∝v·√(1−v)：尖端 ≈32° 自然水滴锥、最宽处在 2/3，实测 widestAt=0.64、tipR=0.079）；尖端锚在原子表面（视觉半径 ×0.9、下限 0.30）而非云心，圆肚朝外；电子点由沿轴 ±0.3 改**并排**（`LPE_OFFSET=0.15` 垂直云轴、`LPE_ALONG=0.55`、半径 0.09）。新增调试钩子 `window.__lpDropProfile()`；`verify_lone_pairs.js` 扩到 9/9（新增 L9 水滴轮廓断言）；回归 `playwright-verify.js` 33/33、`verify_foolproof.js` 22/22。
  10. 电子点改金属材质（2026-10-21，本提交，用户需求「电子的材质能不能改成金属材质」）：云内两个电子点由黑色 `MeshBasicMaterial` → `MeshStandardMaterial`（银灰 `LPE_COLOR=0xc9d3e0`、`LPE_METALNESS=0.95`、`LPE_ROUGHNESS=0.22`，球面细分 18×14 以消除高光棱面）。**关键**：金属反射率=基色且无漫反射，场景只有 Ambient/Directional/Point 灯、没有 `scene.environment`，沿用纯黑基色会完全不反光、几乎看不见 → 新增 `LP_DOT_ENV`：64×32 canvas 竖向渐变（`#eaf3ff`→`#8fa1b8`→`#0a0e14`）经 `PMREMGenerator.fromEquirectangular` 生成环境贴图（three core API、无外部 HDR、file:// 离线可用），`envMapIntensity=1.0` → 呈现抛光钢珠的高光 + 渐变反射。`__lpStats` 增报 material `type/metalness/roughness`；`verify_lone_pairs.js` L2 改为断言金属材质（9/9）；回归 33 几何 33/33、`verify_foolproof.js` 22/22、零 console。2026-10-22 用户再要求「电子改成黑色的」→ 银灰 `0xc9d3e0` 改黑铬近黑 `0x15181c`（纯黑金属 F0=0 会完全没有高光、死黑一片，故保留近黑基色，观感是黑点 + 锐利高光）；`verify_lone_pairs.js` L2 颜色断言同步为 `#15181c`（9/9），33 几何 33/33 无回归。2026-10-23 用户要求「电子云的蓝色再深一点」「更立体点，别像二维」→ `LP_COLOR` `0x9fd0ff` → `0x5fa6e4`（中蓝），云材质 `MeshBasicMaterial`（无光照＝平面感）→ `MeshLambertMaterial`（`emissive=LP_EMISSIVE=0x0a1c2e` 托底阴影、`transparent/opacity 0.72`、`depthWrite:false`），Directional/Point 光在云面形成明暗渐变与体积感；`verify_lone_pairs.js` 增加 L10 受光材质断言并更新色值（10/10），33 几何 33/33 无回归。
  11. 两侧栏可折叠收起（2026-10-24，本提交，用户需求「将界面两侧的区域改为可折叠收起」）：左侧 `#group-sidebar`（预设基团）与右侧 `#sidebar`（原子库）的标题行改为开关 `.title.sb-head`（`#group-sidebar-toggle` / `#sidebar-toggle`，role=button + tabindex=0，Enter/Space 可切换）——点击加 `sb-collapsed`：面板缩为 50px 宽窄胶囊（仅头部图标 + 朝向展开方向的 caret），其余子元素 `display:none`；caret 左栏展开 ← / 收起 →、右栏展开 → / 收起 ←，`title/aria-label/aria-expanded` 同步。默认展开，状态记忆 `SIDEBAR_GROUPS_OPEN` / `SIDEBAR_ATOMS_OPEN`（'0'=收起）；调试 `window.__sidebars{set/toggle/state}`。窄屏折叠态用 id+class 规则压过 `width:min(130px,13vw)` 与 `bottom:16px`（并 `bottom:auto` 防拉成整列高），375×667 实测胶囊 50×53、贴顶 104。新增 `verify_sidebars.js` 10/10（默认/收起/展开/独立/键盘/刷新记忆/手机胶囊/折叠后原子卡真实拖拽/零 console）；回归 33 几何 + 23 π + 36 基团方位 + foolproof 22 + history 12 + keypad 12 + icons 8 + corners 10 + layout_move 7 + guide 6 + ui_input 7 + lone_pairs 10 全绿。
  12. 大分子式检索前筛选（2026-10-24，本提交，用户报告「C₁₂H₁₃N₃O₂ 提示请求失败，能不能在查找之前先让用户筛选」）：**两个根因**——①旧 `fetchFormulaIsomers` 把同一个 `AbortSignal.timeout(20000)` 传给 CID 列表和**所有**属性分块请求，而该信号是一次性的、到点对所有持有者生效；`C12H13N3O2` 有 13,737 个候选、约 275 次属性请求，后续全部 AbortError → 只看到「请求失败」；②专用 `#formula-input` 的分子式被 `parseSmiles` 误判为合法 SMILES（`C6H6` → C+环号 6 / H+闭号 6），分子式分支永不触发。**修复**：每请求独立超时 `pubchemSignal(timeoutMs, runSignal)`（`AbortSignal.any` 合并用户取消，不支持时退回）+ `pubchemJsonRetry`（429/5xx 退避重试，其它 4xx 直接抛）+ 单块失败不整体失败（`chunkFail` 计数）；拆出 `probeFormulaCandidates`（`?MaxRecords=401` 轻量探测）与 `fetchFormulaIsomers(formula, {cids})`；`#formula-input` 优先按 `parseFormula` 解析（名称/SMILES 框仍保留"非合法 SMILES 才当分子式"规则，保 `CCl4`/`c1ccccc1`）。**检索前筛选**：候选 > 400 弹 `#isomer-pre-panel`（复用官能团 17 + 氢类型 8 chips、峰组数、满足全部/任一、每次上限 30/60/120），`runIsomerPresearch` 边分页边取属性、本地分析过滤，命中达上限或扫描预算即停，实时显示「已扫描 / 总数 · 命中」；结果面板标题标注「预筛选」+ 说明条 +「继续检索更多」追加下一批，条件原样带入结果面板筛选 chip。调试 `window.__isomerPresearch{open/close/start/stop/continue/reset/set/state/matches/visible}`；新增 `verify_isomer_presearch.js` **23/23**（探测 401/capped、属性抓取、C₁₂H₁₃N₃O₂ 芳香环 30 个全命中、继续 30→60、条件带入、Esc/点空白/停止/取消、无筛选前 30、手机 375×667 不超屏、375×400 限高可滚动、C2H6O 直出 2 行、C6H6 进枚举含 benzene、33 几何、零 console）；回归 `verify_isomer_filter` 26/26、`verify_isomer_condensed` 25/25、`verify_ui_input` 7/7、`verify_keypad_ui` 12/12、`verify_foolproof` 22/22 全绿。
  13. 浮层开合动画（2026-10-25，本提交，用户需求「能不能给所有下拉框做个动画」）：范围 = 可折叠浮层 + 弹窗（原生 `<select>` 的弹出列表由操作系统绘制，无法动画，保持原样）。**实现选型**：这些浮层平时 `display:none`，display 切换那一帧不会触发 CSS transition → 用 **Web Animations API**（`el.animate()`）；helper 集中在 `hydrateIcons()` 之后（~行 1334-1470），`DD_IN_MS=190`、`DD_OUT_MS=120`。**角落面板**（使用说明 / 设置 / 名称·SMILES / SMILES 输入方法）为手风琴：`maxHeight 0↔scrollHeight` + opacity + `translateY(-6px)`；收起先摘 `.open`（状态立即变「已收起」）并加 `.dd-closing`（CSS 仅 `pointer-events:none`，淡出中不挡原子点击），120ms 后才写 `display:none` 并清理内联 `maxHeight/overflow`——**收起态仍是 `display:none`**（验证脚本与 `isofElVisible` 依赖 computedStyle）。CSS 三处 `.open` 规则扩为 `.open, .dd-closing`。**弹窗**（分子式小键盘 / 异构体面板 / 检索前筛选 / 键线式大图 / 帮助浮层 / 歧义候选 / 键菜单）为淡入淡出 + 轻微缩放，动画帧显式带各自居中 transform（`translate(-50%,-50%)`、`translate(-50%,-100%)`、`translateX(-50%)`）；小键盘只做展开动画、关闭保持瞬时（`verify_keypad_ui` K4/K8 同步读 `style.display`）。**竞态与兜底**：`el.__ddToken` 令牌防「收起未播完又打开被旧回调藏掉」；`_ddRunning` Set + `ddAnim` 的 `setTimeout(finish, ms+250)` 兜底（后台标签页 rAF 被节流时强制收尾）。**接入点**：`setInputPanelOpen`、三个角落 toggle、`_collapseCornerDropdowns`、`showFormulaKeypad`、`showIsomerPanel`/`hideIsomerPanel`、`openIsomerPresearchPanel`/`hideIsomerPresearchPanel`/`runIsomerPresearch`、`openSkeletalLightbox`/`hideSkeletalLightbox`、帮助浮层、`showAmbiguousCandidates`/`hideCandidatePanel`、全部 `bondMenu.style.display` → `showBondMenu()/hideBondMenu()`。**不动**：两侧栏（已有 `transition: width/padding 0.18s`）、`#hybridization-menu`（无样式遗留菜单）、原生 select。**初始化** `setInputPanelOpen(..., {animate:false})` 避免首屏闪动画。调试 `window.__ddAnim`{inMs/outMs/idle()/running()/slideShow/slideHide/fadeShow/fadeHide/setCornerBodyOpen/bondMenu{show,hide}}。新增 `verify_animations.js` **12/12**（A1-A11：三个面板展开/延迟收起、小键盘弹出+瞬时关闭、异构体面板/大图/帮助/键菜单淡入淡出、键菜单居中 transform、真实鼠标点乙烷 C—C 键弹菜单、连点竞态、原生 select 失焦；A12 零 console）；8 个既有脚本改为等 `__ddAnim.idle()` 再断言收起态（corners / layout_move / guide_panel / icons / dropdown_autoclose / isomer_presearch / name_resolve / ui_clear_help2），其余回归全绿。
- 回归基线（最近一次全绿）：`verify_animations` 12/12 · `verify_isomer_presearch` 23/23 · `verify_isomer_filter` 26/26 · `verify_isomer_condensed` 25/25 · `verify_history` 12/12 · `verify_corners` 10/10 · `verify_icons` 8/8 · `verify_dropdown_autoclose` 11/11 · `verify_lone_pairs` 10/10 · `verify_sidebars` 10/10 · `verify_keypad_ui` 12/12 · `verify_foolproof` 22/22 · `verify_delete_icon` 5/5 · `verify_ui_clear_help` ×2 · `verify_group_drag_label` 5/5 · `verify_guide_panel` 6/6 · `verify_autoH` 8/8（expected==got）· `verify_layout_move` 8/8 · `verify_ui_input` 7/7 · 33 几何自测 33/33（`playwright-verify.js`）。

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
