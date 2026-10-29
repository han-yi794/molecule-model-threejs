# 球棍模型 - Three.js 分子建模与几何优化

单文件 Three.js 分子建模应用:通过键长、杂化推断与迭代几何优化,使有机分子(烷烃、烯烃、芳香环、羧酸等)获得化学合理的键角与键长;支持名称/SMILES/分子式(异构体枚举)/蛋白质序列四种输入生成分子,并提供基团拖拽、单键旋转、顺反翻转、原子材质、孤对电子可视化等交互建模能力。全部逻辑内联于单个 HTML,无需构建。

**在线体验**:[https://han-yi794.github.io/molecule-model-threejs/](https://han-yi794.github.io/molecule-model-threejs/)（GitHub Pages 实时同步最新版,浏览器直接打开即可使用）

## 目录

- [功能特性](#功能特性)
- [文件说明](#文件说明)
- [环境要求](#环境要求)
- [运行](#运行)
- [验证](#验证)
- [复现与分析](#复现与分析)
- [核心几何优化](#核心几何优化)
- [球棍模型4.html - 交互功能](#球棍模型4html---交互功能)
- [调试接口(浏览器 Console)](#调试接口浏览器-console)
- [隐私与凭据](#隐私与凭据)
- [技术说明](#技术说明)
- [许可证](#许可证)

## 功能特性

- **几何引擎**:VSEPR 杂化推断 + 迭代优化(sp3 精确四面体模板、sp2 平面、sp 线性、环感知键角),33 例自动自测全绿(键长/键角/连通性)。
- **芳香体系**:苯/吡啶/吡咯/呋喃/噻吩检测(π 电子 6±1)、离域π体系高亮、共轭桥(烯-烯/环-烯/环-环)共面强制。
- **输入管线**:名称 / SMILES / 分子式 / 蛋白质序列四种输入——中文名回译校验防翻译错、分子式自动枚举同分异构体(小键盘输入、下标显示、结构简式 + 本地渲染键线式缩略图)、氨基酸序列经 ESMFold 在线预测 3D 结构。
- **交互建模**:9 种预设基团拖拽成键、一键补氢、四模式拖动(gizmo/锁轴)、拖拽连接提示、单键二面角旋转、双键顺反翻转、选中原子旁删除图标、**撤销/恢复**(顶栏按钮或 Ctrl+Z / Ctrl+Y,覆盖生成/拖拽/删除/优化/清空等操作,最多 50 步)、**三栏工作台**(左侧构建台 / 中间画布 / 右侧检查器,两侧面板可收起为 44px 窄轨道,状态本地记忆)。
- **可视化**:分子状态条(分子式 / 原子 / 键 / 环 / 芳香 / ∠RMS 实时读数)、检查器(选中原子或键的详情、环清单、视图开关)、蓝色半透明水滴形孤对电子云(NEBOOK 风格、受光立体)、四种原子材质风格(自发光/经典/金属/卡通)、网格吸附、拖拽 HUD、悬停高亮。
- **自测体系**:页面内自动测试 + Playwright 回归脚本(33 几何 + 23 π + 36 基团方位,全绿)。

## 程序功能详解

> 完整功能即 `球棍模型4.html`(2/3 号副本已于 2026-10 移除,历史版本可在 git 历史中找回)。

### 1. 分子生成

- **预设示例**:内置 **33 个示例分子**,覆盖烷烃(甲烷/乙烷/丙烷/丁烷/异丁烷)、烯烃(乙烯/丁烯/异丁烯/2-丁烯/丁二烯)、炔烃(乙炔)、芳香环(苯/甲苯/苯甲酸/苯胺/苯酚/吡啶/吡咯/呋喃/噻吩)、饱和环(环己烷/环丙烷/环丁烷,含应力环演示)、官能团链(丙醇/乙醇/甲醇/甲胺/乙酸/丙酮/甲醛/甲酸/畸变丁烷)、键长基准(键长测试)等,由自动自测逐个生成(原子库内的示例下拉/生成/测试按钮已于 2026-10-17 整体移除,日常生成走名称/SMILES/分子式/序列输入,自测走控制台 `window.runAllExamplesAndTests()`)。
- **名称 / SMILES / 分子式 / 序列输入**(顶栏「生成…」打开的右侧 360px 抽屉):四种输入方式——
  - *名称*:输入英文名(ethanol)或中文名(乙醇/阿司匹林),内置库 + PubChem 在线解析;中文名先经回译校验(翻译后反译比对,防误译如 环辛四烯→环十八碳烯),命中修正表时直连。
  - *SMILES*:输入结构式(如 CCO / c1ccccc1),优先取 PubChem 3D 坐标(含 H、几何好),失败回退本地管线。
  - *分子式*:输入化学式(如 C6H6O / O2),自动弹出**同分异构体选择面板**(在线枚举,排除氘代/同位素/组合物),每行显示名称、结构简式与**键线式缩略图**(SmilesDrawer 本地渲染、离线可用;羟基/氨基按教材习惯合写为一个标签,不再拆成 -O-H),**点缩略图可放大查看**——大图界面可用 ‹/› 或 ←/→ 左右切换候选、并直接勾选"生成此分子",✕/点背景/Esc 关闭;可单选或多选并排生成;**小键盘**输入元素+数字(下角标显示如 C₆H₆;元素/数字分区,移动端自动限宽限高不超出屏幕;Esc 或 ✕ 收起)。
    - *候选筛选*:面板顶部可按**官能团**(羟基/醛基/羧基/酯基/醚键/酮羰基/氨基/酰胺/氰基/硝基/苯环/芳香环/环/甲基/C=C/C≡C/卤素)与 **¹H NMR 特征**筛选候选——峰组数表达式(如 `3` / `≥3` / `2-4`)、可排除活泼氢、氢类型(醛氢/芳香氢/烯氢/炔氢/羧酸氢/羟基氢/氨基氢/硫醇氢);多条件支持"满足全部/任一";每行下方实时显示该分子的基团与 ¹H NMR(组数+积分比,如 `3 组 (3:2:1)`),"全选"只勾选当前可见行。
    - *大分子式：检索前筛选*:候选超过 400 个的分子式(如 C₁₂H₁₃N₃O₂,PubChem 上有一万多条记录)不再一次性全量拉取(旧版会因请求超时报"请求失败"),而是先弹出**检索前筛选**面板——同样按官能团 / ¹H NMR 条件收窄,并可选每次上限(30/60/120 个);检索从前往后扫描、命中达到上限即停,顶部实时显示"已扫描 / 总数 · 命中数";结果面板可点**继续检索更多**往后取下一批,预筛选条件会自动带入结果面板的筛选条(可再收窄)。小分子式(≤400 候选)仍直接出结果。
  - *蛋白质序列*:输入氨基酸序列(中文名/三字母/单字母混合均可,≤400 残基),经 **ESMFold** 在线预测 3D 结构(必须联网)。
  - 在线 API(PubChem/CACTUS/ESMFold)均免费免 key,失败静默回退本地管线,控制台标注分子来源。
- **自由搭骨架**:左侧构建台顶部切到「元素」页签,单列拖出 **8 种原子**(C/H/O/N/F/Cl/Br/I,CPK 彩色圆球)到画布,靠近已有原子松开即自动成键。
- **基团拖拽**:左侧构建台顶部切到「基团」页签,单列 **9 个球形预设基团按钮** —— 甲基 CH₃ / 乙基 C₂H₅ / 苯基 Ph / 氨基 NH₂ / 羧基 COOH / 羰基 C=O / 醛基 CHO / 酯基 COOR / 羟基 OH,拖到分子上自动吸附到最近可键合原子,绕连接轴 6 角度选无碰撞朝向(未饱和中心直接成键、保留原有 H;饱和中心沿某 H 方向放置并替换该 H)。
- **一键补氢**(`btn-toggle-hydro`):开启后每次「全局同步优化」自动按价态补齐缺失 H(如乙烷+8、乙烯+4、乙炔+2),再经优化器校正到理想角。
- **删除**:按 Delete/Backspace 键,或点选中原子旁出现的红底删除图标(垃圾桶);「清空」重置画布。

### 2. 几何优化

- **✨ 全局同步优化**(或 Shift+O):对当前分子做多轮迭代——键角阶段(sp3 四面体 / sp2 平面 / sp 线性 / 环感知键角)与键长阶段交替收敛,芳香环排布、饱和环规则排列、共轭桥共面收尾。开启自动补氢时该按钮即补氢+优化一体入口。
- **手动杂化**:选中原子后按 0/1/2/3 强制 自动 / sp³ / sp² / sp(或 Ctrl/⌘+点击原子弹出杂化菜单),观察 VSEPR 自动推断与手工指定的差异。

### 3. 交互编辑

- **选中**:单击原子高亮(琥珀色光晕);单击键弹出键菜单(该键上可做的操作)。
- **四种拖动方式**(右下角徽章单击循环,Shift+点击反向;或 Tab/Shift+Tab 快捷键):平面自由拖 / 三轴手柄(红 X·绿 Y·蓝 Z,拖柄或中心球)/ 起始轴锁(首次移动超 6px 锁定最近世界轴)/ 手柄+锁轴组合;方式记忆在本地。
- **三栏工作台**:顶栏 44px(分子名 + 撤销/恢复/优化/清空/帮助/生成…),左侧「构建台」(顶部「基团 / 元素」页签,单列球形卡片,同一时刻只显示一组、选择本地记忆)、中间画布井 + 底部状态条、右侧「检查器」(选中详情 / 环 / 视图开关);点面板标题行收起为 44px 窄轨道(图标 + 朝向展开方向的箭头),再点展开,两侧互不影响、状态本地记忆,Enter/Space 亦可切换。窄屏(≤899)两侧默认收为轨道,展开一侧自动收起另一侧;手机(≤699)改为底部「构建 / 检查 / 生成」栏 + 底部抽屉。
- **网格吸附**(`btn-toggle-grid` 或 G 键):松手位置吸附到 0.25 Å 网格。
- **拖拽连接提示**:拖动原子/新原子时,最近可成键目标实时点亮点,松开即吸附成键。
- **单键旋转(二面角)**:选中单键 → 点任一端点原子设为"旋转侧"→ 按住空白处左右拖动,整侧子图绕键轴旋转(HUD 实时显示二面角),可换侧/取消。双键、芳香键、环内键会拒绝(提示原因)。
- **顺反异构翻转**:选中双键 → 键菜单「⇄ 顺反」,一侧旋转 180° 交换两个取代基位置(顺式⇄反式),菜单可连点翻回。
- **共轭桥保护**:离域π开启时,苯甲酸羧基-苯基、苯乙烯、联苯等共轭桥单键禁止旋转(toast 说明),保证共平面共轭;关闭离域π后可旋转。
- **撤销 / 恢复**(顶栏 `撤销`/`恢复` 图标按钮,或 Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y):快照式历史,覆盖分子生成、原子/基团拖拽、删除、键类型修改与顺反翻转、单键旋转、全局优化、一键补氢、清空、键盘微移(连续微移 400ms 内合并为一步)等操作;栈上限 50 步,新操作自动清空"恢复"链,空栈时提示。

### 4. 可视化与辅助

- **离域π键**(`btn-toggle-deloc`):开启时杂化推断考虑共轭(苯酚/苯胺 lp 参与共轭→sp2),并可「显示离域π键」(`btn-toggle-pi`)高亮 π 体系;离域π自测可用控制台 `window.__runPiSystemTests()` 触发(页面内自测按钮已移除)。
- **孤对电子**(`btn-toggle-lp`):每对孤对显示为蓝色半透明水滴云(尖端贴原子、圆肚朝外、受光立体)+ 并排双金属电子点(黑铬 MeshStandardMaterial,NEBOOK H₂O 风格),方向随 VSEPR 模板实时更新(如水中 O 两对、氨中 N 一对)。
- **原子材质**(检查器「视图」段下拉):自发光(霓虹,忽略场景光)/ 经典光泽 / 金属 / 卡通 四种风格,实时切换并记忆。
- **拖拽辅助**:HUD 显示位移(轴拖显示单轴分量,平面拖显示 Δ 三分量)、悬停 gizmo/原子高亮与光标反馈、首次使用引导 toast。
- **帮助面板**(顶栏 ? 图标):操作指南、快捷键、四种拖动方式图解。
- **生成抽屉**(顶栏「生成…」/ 手机底部「生成」):右侧 360px 非模态抽屉,收纳名称/SMILES/分子式/序列输入与 SMILES 语法帮助;生成成功后自动收起。
- **浮层开合动画**:生成抽屉滑入滑出(190ms transform + visibility)、面板折叠(180ms 列宽过渡)、手机底部抽屉上滑、小键盘弹出、异构体面板 / 检索前筛选 / 键线式大图 / 帮助浮层 / 歧义候选 / 键菜单淡入淡出 + 轻微缩放。淡出过程中浮层不接收点击,不会挡住原子操作;原生 `<select>` 的弹出列表由系统绘制,无动画;`prefers-reduced-motion` 下过渡自动关闭。
- **分子状态条 / 检查器**:画布底部实时读数(分子式、原子数、键数、环数、芳香标记、键角 RMS),右侧检查器显示选中原子(元素、杂化、键数、坐标)或选中键(类型、两端、键长)、环清单与视图开关。
- **选中删除**:选中原子右上角挂红底垃圾桶图标,点击删除该原子;点空白取消选中时图标消失。
- **旋转视角**:空白处拖动旋转视角,滚轮缩放(旋转单键时空白拖动切换为旋转分子侧)。

### 5. 自动测试

- 自动测试在页面内跑 33 例(先生成→随机扰动 0.9→优化→断言键长/键角/连通性),结果写入 `window.lastRunResults`;首屏不自动执行,由验证脚本或控制台 `window.runAllExamplesAndTests()` 手动触发(「自动测试全部」按钮已移除)。扰动期键表快照恢复(幅度再大不断键、不增键),优化期收敛保证(键角超标自动加轮直至达标)。
- 键菜单/控制台调试接口见下文「调试接口」。

## 文件说明

| 文件 | 说明 |
|------|------|
| `球棍模型4.html` | 唯一主文件:几何引擎 + 输入管线(名称/SMILES/分子式异构体/蛋白质 ESMFold)+ 交互建模全功能集(见下);2/3 号副本已移除,历史版本可在 git 历史中找回 |
| `playwright-verify.js` | 主验证脚本:加载 4 号页面、触发并采集 33 例自测结果、输出 JSON |
| `verify_regression.js` | 回归总装:33 几何 + 23 π |
| `verify_distort.js` | 大畸变专项:手摆乙醛甲基 H 聚拢(3 档)→一键优化键角恢复+连接保持 |
| `verify_groups_fix.js` | 基团放置回归:9 组 × 4 方位 = 36 场景 |
| `verify_isomer_condensed.js` | 异构体面板:结构简式转换器电池、真实弹窗(C2H6O)、键线式放大查看器(含 ‹›/←→ 切换、勾选"生成此分子"、本地画布渲染与缩放回归保护,25 项) |
| `verify_isomer_filter.js` | 异构体候选筛选:分析器电池 39 例、峰组数表达式、真实 UI 筛选/全选/重置/C4H8 数据驱动/筛选内放大切换范围(26 项) |
| `verify_isomer_presearch.js` | 大分子式检索前筛选:候选探测(401/capped)、属性抓取、真实 UI(C₁₂H₁₃N₃O₂ 芳香环筛选 30 个、说明条/继续 30→60、条件带入、Esc/停止/取消、无筛选前 30)、手机 375×667/375×400 不超屏可滚动、C2H6O/C6H6 回归(23 项) |
| `verify_history.js` | 撤销/恢复专项(12 项):按钮/图标/布局/初始状态、空栈提示、拖拽/删除/移动/优化/清空/生成的提交点、复合操作恰记一条、键盘微移合并、redo 失效规则、快捷键、位置精确还原 |
| `verify_shell.js` | 三栏外壳:顶栏结构(分子名/撤销/恢复/优化/清空/帮助/生成…)、三栏几何(224 / 中间 / 224)、旧角落控件已删除、手机底部栏与底部抽屉(9 项) |
| `verify_help.js` | 帮助浮层:顶栏 `#btn-help` 打开,四段内容 + Esc 说明,✕ / 点暗背景 / Escape 三种关闭,手机端(8 项) |
| `verify_sidebars.js` | 面板折叠 + 构建库页签:构建台/检查器收起为 44px 轨道、互不影响、键盘 Enter/Space、刷新记忆、基团/元素切换与 BUILD_LIB 记忆、手机抽屉内切换、手机不拉伸、折叠后仍可拖拽(11 项) |
| `verify_layout_move.js` | 布局迁移:抽屉贴右 360px、检查器常驻、断点(≥1100 / 700-899 / ≤699)、抽屉覆盖层行为(8 项) |
| `verify_animations.js` | 浮层开合动画:抽屉滑入滑出、面板列宽过渡、小键盘弹出(关闭瞬时)、异构体面板/大图/帮助/键菜单淡入淡出、快速连点竞态、手机底部抽屉、原生 select 不受影响(12 项) |
| `verify_dropdown_autoclose.js` | 浮层「点击别处收起」:抽屉点画布收起、内部点击保持、开关不被拦截、小键盘联动、手机生成按钮、原生 select 失焦、面板折叠不受影响(11 项) |
| `verify_foolproof.js` | 防呆测试:22 项边界/误操作场景(空状态、非法参数注入、状态机、极端几何、真实鼠标误操作) |
| `verify_inline_offline.js` | 离线验证:file:// 打开 + 拦截全部网络请求,确认零 http 请求(Three.js/SmilesDrawer 内联、键线式本地渲染) |
| `probe_trace.js` | 单例复现:`node probe_trace.js <seed> <example>` |
| `analyze_angle.js` / `analyze_ring.js` / `analyze_trace.js` | 收敛过程分析脚本 |
| `download_three.js` / `build_inline.js` / `download_smilesdrawer.js` / `build_inline_smilesdrawer.js` / `download_lucide.js` | 内联库(Three.js / SmilesDrawer / Lucide)下载与幂等重建脚本;下载产物 `vendor_tmp/` 不入库 |
| `docs/` | 功能验证记录(`cistrans-verify.md`)与 Agent 工作技能文档 |
| `AGENTS.md` | 项目深坑/几何优化关键函数速查(开发者/Agent 向) |

## 环境要求

- 浏览器:任意现代浏览器(Chrome/Edge/Firefox)
- 验证脚本:Node.js ≥ 20 + Playwright 1.62(`npx playwright install chromium`)
- 静态服务器:Python(或任意静态服务器)

## 运行

```bash
# 仓库根目录起静态服务器(浏览器直接双击 HTML 文件也可,但验证脚本依赖 HTTP)
python -m http.server 8000
```

浏览器访问:
- http://127.0.0.1:8000/球棍模型4.html (首屏不自动跑自测,测试由验证脚本/控制台触发)

## 验证

```bash
# 33 例几何自测 + 连通性断言(脚本手动触发,约 40 秒)
cmd /c "node playwright-verify.js > verifyN.json 2>&1"   # PowerShell 须重定向,否则输出损坏
# 36 基团放置场景
cmd /c "node verify_groups_fix.js > verifyG.json 2>&1"
```

- 自测报告读取:轮询 `window.lastRunResults`(33 例全跑完才写入);页面内 `window.runAllExamplesAndTests()` 可手动触发。
- 全部自测当前状态:**33 几何 + 23 π + 36 基团方位全绿**;三栏外壳 9、帮助 8、面板折叠/构建库页签 11、布局迁移 8、浮层动画 12、点别处收起 11、小键盘 12、撤销/恢复 12、防呆 22、历史/输入/离线等 UI 脚本全绿。

## 复现与分析

- `node probe_trace.js <seed> <example>` —— 固定 seed 单例逐轮键长/角度输出(argv[2]=seed、argv[3]=示例名,如 `node probe_trace.js 12345 propanol`)。
- `analyze_angle.js` / `analyze_ring.js` —— 追踪数据的收敛过程分析。

## 核心几何优化

- `optimizeAllAtoms()`:迭代优化主循环(键角阶段 → 键长阶段 → 共轭桥共面)。
- `getIdealDirections()`:sp3 用**精确四面体模板**(锚定方向 + 109.47°);sp2 平面、sp 线性模板;VSEPR 未占域写为孤对方向。
- 锚定/框架**每轮刷新不缓存**(修复链式分子两端模板冲突与 propanol 整链旋转不收敛)。
- **非芳香环径向守卫**:环-环邻居只做径向保持,切向牵引移除(环己烷不再拉飞)。
- **环感知键角**:闭合环按环内角 θn / 外角平分 / 环法线 ±60° 出平面取理想角,`computeBondAngleStd` 为相对该理想角的 RMS。
- **环排列**:芳香环(苯/吡啶/吡咯/呋喃/噻吩,π 电子 6±1)与饱和环(3≤n≤8)规则排布,外环 H 全部跟随。
- **共轭桥共面**:烯-烯/环-烯/环-环单键桥迭代旋转至二面角 0°/180°,保证共轭体系共平面。
- `inferHybridization()`:VSEPR 域数 = σ邻居 + 孤对;芳香环内强制 sp2。
- `updateBonds()`:键创建阈值 1.24×目标长、删除 2.00×;渲染循环只删不增,新增键仅在生成/优化期。
- `getTargetBondLength()`:单键 = 原子半径和;双键×0.87、三键×0.78、芳香 1.5 键 1.40,含杂芳环键长表。
- **收敛保证**:每 20 轮检查重原子键角 std,超标(>3°)且在改善则延长迭代(上限 280 轮);畸变初值(手摆甲基 H 聚拢)一轮优化即收敛到杂化理想角,已收敛分子零额外开销(`OPT_PARAMS.CONVERGENCE_STD/MAX_ITER` 可调)。
- **扰动连接保证**:`perturbMolecule()` 先快照键表再扰动,事后补误删、删误增;优化期 `updateBonds` 只更新几何不改键表——连接在优化开始前永远正确。

## 调试接口(浏览器 Console)

- `window.__diag`(环/芳香/杂化诊断 `ringsInfo()`/`isArom(id)`/`hybOf(id)`/`sigmaProbe()`)、`window.lastRunResults`、`window._INIT_ERRORS`
- `window.__panels`{set(name,collapsed)/toggle/state}(三栏面板折叠,`name` = `build` / `inspect`)、`window.__sidebars`(旧接口别名,`group-sidebar`/`sidebar` 映射到 `build`)、`window.__buildLib`{get/set/state}(构建台「基团 / 元素」页签,记忆键 `BUILD_LIB`)、`window.__setInputPanelOpen(open)`(生成抽屉开关)
- `window.__statusBar()`(分子状态条读数:分子式/原子/键/环/芳香/∠RMS)、`window.__fitView()`(取景到当前分子)
- `window.__history`{undo/redo/canUndo/canRedo/depth/reset/commit/snapshot}(撤销/恢复栈,快照式)
- `window.__ddAnim`{inMs/outMs/idle()/running()/slideShow/slideHide/fadeShow/fadeHide/setCornerBodyOpen/bondMenu{show,hide}}(浮层开合动画;验证脚本用 `idle()` 等待动画收尾)
- `window.__dragMode`{project/raycastGizmo/atoms/...}、`window.__torsion`、`window.__cisTrans`、`window.__conjBridge`{is/list/tryPivot}、`window.__attachDeleteIcon`/`__detachDeleteIcon`
- `window.__lpStats`(孤对统计)/`__lpDropProfile`(水滴剖面 length/maxR/tipR/widestAt)、`window.__connectHint`、`window.__piSystemsSummary`、`window.__runPiSystemTests()`、`window.__atomStyle`{get/set/list}
- 输入管线:`window.__parseFormula`/`__toSubscriptFormula`/`__fetchFormulaIsomers`/`__probeFormulaCandidates`/`__isomerPresearch`{open/close/start/stop/continue/reset/set/state/matches}/`__showIsomerPanel`/`__generateSelectedIsomers`/`__parseAaSequence`/`__fetchProteinPDB`/`__generateFromProteinSeq`/`__translateZhToEn`
- 异构体/键线式:`window.__smilesToCondensed`/`__toSubscriptCondensed`/`__analyzeIsomerStructure`/`__isomerFilter`{analyze/state/set/reset/rows}、`window.__skeletalRender`/`__openSkeletalLightbox`/`__hideSkeletalLightbox`/`__skeletalLightbox`{state/next/prev}
- 参数注入:`window.OPT_PARAMS`、`localStorage.OPT_PARAMS_OVERRIDE`(见 HTML 内 `DEFAULT_OPT_PARAMS`)

## 隐私与凭据

- **GitHub 凭据**:仓库不存储任何 token。push 认证由 `gh auth setup-git` 配置的 `gh auth git-credential` helper 提供(仓库 `~/.gitconfig` 中 `credential.https://github.com.helper`)。
- **本机路径脱敏**:`probe_trace.js` / `analyze_angle.js` / `analyze_ring.js` / `analyze_trace.js` 的 trace 输出路径均用 `process.env.TEMP` 动态解析(退出码/输出文件名不变),不硬编码任何绝对路径或用户名。历史上曾含绝对路径的 commit 已通过 filter-branch 重写清除。
- 仓库中不含任何密钥、API key 或个人信息;提交作者统一为 `dev <dev@local>`。

## 技术说明

- 无构建/无模块系统,全部逻辑内联于单 HTML(UTF-8),关键函数挂 `window`。
- 依赖:Three.js 与 SmilesDrawer(均本地内联、完全离线可用)、Playwright 1.62(仅验证脚本,Node ≥ 20)。
- 常见陷阱(深坑记录在 `AGENTS.md`):验证脚本中文文件名为 GBK 字节需百分号编码;`__AUTOTEST_DONE__` 仅当报告 DOM 存在时置位,完成状态一律读 `window.lastRunResults`;PowerShell 输出损坏 JSON 需重定向;键线式 canvas 渲染按 `canvas.offsetWidth` 计算自适应缩放,绘制期须临时改写内联尺寸/`max-height`(详见 AGENTS.md)。

## 许可证

[MIT License](LICENSE) — Copyright (c) 2026 han-yi794
