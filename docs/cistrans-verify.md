# 顺反异构翻转功能验证记录 (2026-08-10)

## 结论
全部验证通过。功能已合入 `球棍模型4.html`。

## 功能
- 选中双键弹键菜单 → 新增「⇄ 顺反」按钮(仅双键 type∈[1.9,2.1] 显示)
- 点击 = 绕双键轴(atomA→atomB)把 atomB 侧整侧子图旋转 180°(`collectTorsionSide` 复用,刚体旋转保持 sp2 平面与键长)
- 顺反判定:`cisTransOf(bond)` —— 两端各取第一个非双键邻居,投影到垂直双键轴平面,点积同侧=cis / 异侧=trans
- 拒绝:非双键(芳香 1.5/单键/三键)、环内双键(会断环)
- debug: `window.__cisTrans` {of/flip/flipSelected/bond}
- 示例: 顺式-2-丁烯 (Z)-CH3CH=CHCH3(`generateButene2` + `CONNECTIVITY_SPECS.butene2` + 下拉选项)

## 验证结果
### 逻辑测试 (页面 evaluate)
| 场景 | 结果 |
|---|---|
| butene2 初始 | "cis" ✓ |
| flip 一次 | "trans" ✓ |
| flip 两次 | "cis" ✓ |
| flip 三次 | "trans" ✓ (回归) |
| 苯环 1.5 键 flip | null + toast "仅双键可翻转顺反" ✓ |
| 乙烷单键 flip | null + toast ✓ |
| 乙炔三键 flip | null + toast ✓ |
| 乙烯双键 flip | trans→cis 可执行(两端同为 H,无视觉差异,不阻断) ✓ |
| 环内双键 | findAllRings 检查拒绝 ✓ |

### 真实鼠标测试 (playwright)
1. 生成 butene2,双键原子投影中点附近点击 (470,452) → bond-type-menu 弹出 `flex`
2. 顺反按钮 rect: 86×54(胶囊形,min-width 62px,`white-space:nowrap` 单行),display flex
3. 点击按钮 (722,598) → toast "已翻转为反式 (trans/E)",`__cisTrans.of` = "trans"
4. 再点 → toast "已翻转为顺式 (cis/Z)",of = "cis"
5. 乙烷(单键)选中 → 菜单弹出但顺反按钮 `display:none` ✓

### 回归
- verify_groups_fix.js: 36 方位基团放置全绿,carboxyl angleCheck {std:0, angles:[120,120,120]}
- verify_regression.js: reg4 geom 33/33、pi 23/23;reg2 33/33;reg3 23/23;errors []