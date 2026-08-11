# 球棍模型 - Three.js 分子建模与几何优化

单文件 Three.js 分子建模应用:通过键长、杂化推断与迭代几何优化,使有机分子(烷烃、烯烃、芳香环、羧酸等)获得化学合理的键角与键长;并提供基团拖拽、单键旋转、顺反翻转、孤对电子可视化等交互建模能力。全部逻辑内联于单个 HTML,无需构建。

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
- **交互建模**:9 种预设基团拖拽成键、一键补氢、四模式拖动(gizmo/锁轴)、拖拽连接提示、单键二面角旋转、双键顺反翻转。
- **可视化**:青色水滴形孤对电子云(NEBOOK 风格)、网格吸附、拖拽 HUD、悬停高亮。
- **自测体系**:页面内自动测试 + Playwright 回归脚本(33 几何 + 23 π + 36 基团方位)。

## 程序功能详解

> 以功能最全的 `球棍模型4.html` 为例(HUD、快捷键等交互特性二/三号文件亦有)。

### 1. 分子生成

- **预设示例**:顶部下拉提供 **16 个示例分子**,覆盖烷烃(甲烷/乙烷/丙烷)、烯烃(乙烯/2-丁烯)、炔烃(乙炔)、芳香环(苯)、饱和环(环己烷/环丙烷/环丁烷,含应力环演示)、官能团链(畸变丁烷)、键长基准(键长测试)等,点「生成」载入。
- **自由搭骨架**:侧面原子卡片拖出 **8 种原子**(C/H/O/N/F/Cl/Br/I)到画布,靠近已有原子松开即自动成键。
- **基团拖拽**:侧栏 **9 个预设基团** —— 甲基 CH₃ / 乙基 C₂H₅ / 苯基 Ph / 氨基 NH₂ / 羧基 COOH / 羰基 C=O / 醛基 CHO / 酯基 COOR / 羟基 OH,拖到分子上自动吸附到最近可键合原子;基团整体按目标原子价态取向,并绕连接轴在 6 个角度中选无碰撞朝向(优先替换目标上的 H,不误建第二键)。
- **一键补氢**(`btn-toggle-hydro`):开启后每次「全局同步优化」自动按价态补齐缺失 H(如乙烷+8、乙烯+4、乙炔+2),H 方向按重原子邻居反方向/球面最大夹角采样初定,再经优化器校正到理想角。
- **删除**:选中原子后点「删除选中」;「清空」重置画布。

### 2. 几何优化

- **✨ 全局同步优化**(或 Shift+O):对当前分子做多轮迭代——键角阶段(sp3 四面体 / sp2 平面 / sp 线性 / 环感知键角)与键长阶段交替收敛,芳香环排布、饱和环规则排列、共轭桥共面收尾。开启自动补氢时该按钮即补氢+优化一体入口。
- **手动杂化**:选中分子后可在「杂化」区强制 sp³ / sp² / sp / 自动,观察 VSEPR 自动推断与手工指定的差异。

### 3. 交互编辑

- **选中**:单击原子高亮(琥珀色光晕);单击键弹出键菜单(该键上可做的操作)。
- **四种拖动方式**(右下角徽章或 `#drag-mode-select`,Tab/Shift+Tab 循环):平面自由拖 / 三轴手柄(红 X·绿 Y·蓝 Z,拖柄或中心球)/ 起始轴锁(首次移动超 6px 锁定最近世界轴)/ 手柄+锁轴组合;方式记忆在本地。
- **网格吸附**(`btn-toggle-grid` 或 G 键):松手位置吸附到 0.25 Å 网格。
- **拖拽连接提示**:拖动原子/新原子时,最近可成键目标实时点亮点,松开即吸附成键。
- **单键旋转(二面角)**:选中单键 → 点任一端点原子设为"旋转侧"→ 按住空白处左右拖动,整侧子图绕键轴旋转(HUD 实时显示二面角),可换侧/取消。双键、芳香键、环内键会拒绝(提示原因)。
- **顺反异构翻转**:选中双键 → 键菜单「⇄ 顺反」,一侧旋转 180° 交换两个取代基位置(顺式⇄反式),菜单可连点翻回。
- **共轭桥保护**:离域π开启时,苯甲酸羧基-苯基、苯乙烯、联苯等共轭桥单键禁止旋转(toast 说明),保证共平面共轭;关闭离域π后可旋转。

### 4. 可视化与辅助

- **离域π键**(`btn-toggle-deloc`):开启时杂化推断考虑共轭(苯酚/苯胺 lp 参与共轭→sp2),并可「显示离域π键」(`btn-toggle-pi`)高亮 π 体系,「离域π键自测」一键跑 23 项检测并报告。
- **孤对电子**(`btn-toggle-lp`):每对孤对显示为青色水滴云 + 双黑点(NEBOOK 风格),方向随 VSEPR 模板实时更新(如水中 O 两对、氨中 N 一对)。
- **拖拽辅助**:HUD 显示位移(轴拖显示单轴分量,平面拖显示 Δ 三分量)、悬停 gizmo/原子高亮与光标反馈、首次使用引导 toast。
- **帮助面板**(右下 `?` 或 HUD 徽章区):操作指南、快捷键、四种拖动方式图解。
- **旋转视角**:空白处拖动旋转视角,滚轮缩放(旋转单键时空白拖动切换为旋转分子侧)。

### 5. 自动测试

- 「自动测试全部」在页面内跑 33 例(先生成→随机扰动 0.45→优化→断言键长/键角/连通性),结果写入 `window.lastRunResults`;首屏默认自动执行(URL 加 `noauto=1` 可跳过)。
- 键菜单/控制台调试接口见下文「调试接口」。

## 文件说明

| 文件 | 说明 |
|------|------|
| `球棍模型2.html` | 主版:几何优化 + 33 例自动自测(键长/键角/连通性) |
| `球棍模型3.html` | 离域π键专题副本:芳香/共轭体系检测、π 键高亮、`runPiSystemTests()` 22 项自测 |
| `球棍模型4.html` | 基团拖拽版:交互建模全功能集(见下) |
| `playwright-verify.js` | 主验证脚本:加载页面、采集 33 例自测结果、输出 JSON |
| `verify_groups_fix.js` | 基团放置回归:9 组 × 4 方位 = 36 场景 |
| `probe_trace.js` | 单例复现:`node probe_trace.js <seed> <example>` |
| `analyze_angle.js` / `analyze_ring.js` / `analyze_trace.js` | 收敛过程分析脚本 |
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
- http://127.0.0.1:8000/球棍模型2.html
- http://127.0.0.1:8000/球棍模型3.html?noauto=1
- http://127.0.0.1:8000/球棍模型4.html?noauto=1 (`noauto=1` 跳过首屏自动测试)

## 验证

```bash
# 33 例几何自测 + 连通性断言(页面加载后自动运行,约 37 秒)
cmd /c "node playwright-verify.js > verifyN.json 2>&1"   # PowerShell 须重定向,否则输出损坏
# 36 基团放置场景
cmd /c "node verify_groups_fix.js > verifyG.json 2>&1"
```

- 自测报告读取:轮询 `window.lastRunResults`(33 例全跑完才写入);页面内 `window.runAllExamplesAndTests()` 可手动触发。
- 全部自测当前状态:**33 几何 + 23 π + 36 基团方位全绿**。

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

## 调试接口(浏览器 Console)

- `window.__diag`(环/芳香/杂化诊断 `ringsInfo()`/`isArom(id)`/`hybOf(id)`/`sigmaProbe()`)、`window.lastRunResults`、`window._INIT_ERRORS`
- `window.__dragMode`{project/raycastGizmo/atoms/...}、`window.__torsion`、`window.__cisTrans`、`window.__conjBridge`{is/list/tryPivot}
- `window.__lpStats`(孤对统计)、`window.__connectHint`、`window.__piSystemsSummary`
- 参数注入:`window.OPT_PARAMS`、`localStorage.OPT_PARAMS_OVERRIDE`(见 HTML 内 `DEFAULT_OPT_PARAMS`)

## 隐私与凭据

- **GitHub 凭据**:仓库不存储任何 token。push 认证由 `gh auth setup-git` 配置的 `gh auth git-credential` helper 提供(仓库 `~/.gitconfig` 中 `credential.https://github.com.helper`)。
- **本机路径脱敏**:`probe_trace.js` / `analyze_angle.js` / `analyze_ring.js` / `analyze_trace.js` 的 trace 输出路径均用 `process.env.TEMP` 动态解析(退出码/输出文件名不变),不硬编码任何绝对路径或用户名。历史上曾含绝对路径的 commit 已通过 filter-branch 重写清除。
- 仓库中不含任何密钥、API key 或个人信息;提交作者统一为 `dev <dev@local>`。

## 技术说明

- 无构建/无模块系统,全部逻辑内联于单 HTML(UTF-8),关键函数挂 `window`。
- 依赖:Three.js(本地内联)、Playwright 1.62(仅验证脚本,Node ≥ 20)。
- 常见陷阱(深坑记录在 `AGENTS.md`):验证脚本中文文件名为 GBK 字节需百分号编码;`__AUTOTEST_DONE__` 仅当报告 DOM 存在时置位,完成状态一律读 `window.lastRunResults`;PowerShell 输出损坏 JSON 需重定向。

## 许可证

[MIT License](LICENSE) — Copyright (c) 2026 han-yi794
