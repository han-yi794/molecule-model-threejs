# 球棍模型 - Three.js 分子建模与几何优化

单文件 Three.js 分子建模应用:通过键长、杂化推断与迭代几何优化,使有机分子(烷烃、烯烃、芳香环、羧酸等)获得化学合理的键角与键长;并提供基团拖拽、单键旋转、顺反翻转等交互建模能力。

## 文件说明

| 文件 | 说明 |
|------|------|
| `球棍模型2.html` | 主版:几何优化 + 33 例自动自测(键长/键角/连通性) |
| `球棍模型3.html` | 离域π键专题副本:芳香/共轭体系检测、π 键高亮、`runPiSystemTests()` 22 项自测 |
| `球棍模型4.html` | 基团拖拽版:交互建模全功能集(见下) |
| `playwright-verify.js` | 主验证脚本:加载页面、采集 33 例自测结果、输出 JSON |
| `verify_groups_fix.js` | 基团放置回归:9 组 × 4 方位 = 36 场景 |
| `probe_trace.js` | 单例复现:`node probe_trace.js <seed> <example>` |
| `docs/` | 功能验证记录与 Agent 工作技能文档 |

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

- `node probe_trace.js <seed> <example>` —— 单例逐轮键长/角度输出(y 参数:seed、示例名)。
- `analyze_angle.js` / `analyze_ring.js` —— 收敛过程分析。

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

## 球棍模型4.html - 交互功能

- **基团拖拽**:侧栏 9 个预设基团(methyl/ethyl/phenyl/amino/carboxyl/carbonyl/aldehyde/ester/hydroxyl)拖到分子上吸附成键;基团几何按锚原子杂化理想角精修(C-O-H 109.47°、sp2 120° 等)。
- **四种拖动方式**(`#drag-mode-select` 切换,持久化):平面/三轴 gizmo/起始轴锁/gizmo+锁轴;网格吸附 0.25 Å;HUD 显示位移、悬停高亮、模式徽章 + Tab 快捷键、帮助面板。
- **一键补氢**(`btn-toggle-hydro`):按价态补 missingH,全局优化入口统一经 `optimizeAllWithAutoHydrogen()`。
- **离域π键**(`btn-toggle-deloc`):杂化提升(苯酚/苯胺供体)、离域体系检测与高亮、共轭桥共面强制。
- **孤对电子可视化**(`btn-toggle-lp`):青色水滴云(NEBOOK 风格) + 双黑点,方向来自 VSEPR 模板未占域。
- **拖拽连接提示**:拖动中实时高亮"松开即可成键"的原子,松开自动吸附成键。
- **单键旋转(二面角)**:选中单键 → 点端点设旋转侧,拖空白处绕键轴旋转整侧子图(ChimeraX Adjust Torsions 语义);双键/芳香键/环内键拒绝。
- **顺反异构翻转**(`btn-flip-cistrans`):选中双键点「⇄ 顺反」,B 侧旋转 180° 互换构型(cis/trans 判定内置)。
- **共轭桥旋转锁死**:离域π模式下,苯甲酸羧基-苯基、苯乙烯、联苯等共轭桥单键拒绝旋转(保持共平面);关闭离域π后可旋转。

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