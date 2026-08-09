# 球棍模型优化项目说明

## 项目概览
- 文件：`球棍模型2.html`
- 类型：Three.js 单页分子建模与几何优化应用
- 目标：通过键长、杂化推断与迭代几何优化，使简单有机分子（如烷烃、烯烃、苯环）获得更合理的键角和键长。

## 当前状态
- **33 个自测全部通过（连续多轮验证，含随机扰动下稳定）**：`methane` 到 `adenineLike` 的键长/键角/连通性断言均通过。
- 核心几何优化策略：
  - `sp3` 使用**精确四面体模板**，锚定在最高键级 C 邻居方向上，其余方向与其成 109.47°。
  - sp3 锚定与 sp2 平面框架**每轮刷新**（不缓存），链式分子两端模板自然一致，收敛到 aStd ≤ 0.5°。
  - **非芳香环径向守卫**：环-环邻居只做径向保持，切向牵引被移除（环己烷不再拉飞）。
  - 芳香环平面化、`sp2` 共面化、`sp` 线性化等保守几何处理保留。
- 页面内自动测试输出 `angleStdBefore` / `angleStdAfter` 及连通性比对结果。

## 已知问题
1. ~~`ethane` / `propane` 未稳定通过自动测试~~ → 已修复（精确四面体模板 + 锚定每轮刷新），aStd ≤ 0.5°。
2. 自动测试结果采集：验证脚本可靠读取方式为轮询 `window.__AUTOTEST_DONE__` 或读 `localStorage.LAST_AUTOTEST_REPORT` / `window.lastRunResults`。
3. 生成器与 `CONNECTIVITY_SPECS` 的原子顺序/数量需严格一致（isobutane、isobutene、acetone、adenineLike 均已对齐）。
4. 验证输出在 PowerShell 中会损坏，须用 `cmd /c "..." > verifyN.json 2>&1` 重定向到文件再解析。

## 改进建议
### 重点修复方向
- 提升 `sp3` 四面体约束的确定性，直接基于每个碳中心的 109.5° 目标角度误差进行修正。
- 对链式烷烃引入更系统的骨架方向保持策略，避免扁平化或节段扭曲。
- 让初始布局更系统、少依赖单个邻居方向。

### 测试与验证
- 验证命令：`cmd /c "node playwright-verify.js > verifyN.json 2>&1"`（页面加载后 900ms 自动跑全部测试）。
- 单例复现：`node probe_trace.js <seed> <example>`，配套分析脚本 `analyze_angle.js` / `analyze_ring.js`。
- 回归重点：`ethane`、`propane`、`butane`、`isobutane`、`cyclohexane`、`propanol`。

### 代码关注点
- `optimizeAllAtoms()`：优化循环、阻尼、目标位置分配逻辑
- `getIdealDirections()`：sp3 精确四面体模板、锚定/框架每轮刷新、非芳香环径向守卫
- `inferHybridization()`：杂化判定和孤对估算逻辑
- `updateBonds()`：键创建/删除阈值与 `animate()` 的 `noAdd` 行为

## 未来扩展建议
- 加入更稳定的 VSEPR 角度约束求解器
- 为非环烷烃实现更强的链段平滑优化
- 增加更多自动测试例子，例如丁烷/异丁烷的 3D 形状合理性断言
- 若项目继续，可考虑将复杂几何逻辑拆成独立模块，便于单元测试
- 生成器与 `CONNECTIVITY_SPECS` 解耦：由 spec 自动生成初始原子顺序
