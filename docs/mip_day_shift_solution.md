# 方案A（MIP）完整重设计

## 1. 目标与口径（与当前页面一致）

从“每日最低人力配置”出发，在完成“大夜管理和配置”后，统一按以下口径建模：

1. 基线缺口：
- `gap = max(0, totalDemand - sum(expectedWhiteDays_i))`
- 其中 `expectedWhiteDays_i` 与月度班次配置口径一致（优先读人员目标字段，否则按公式估算）。

2. 综合补缺参数：
- `m`: 减少白班需求人天（优先非节假日，分散，不集中）
- `n`: 多上 1 天的人数
- `l`: 多上 2 天的人数
- 必须满足：`m + n + 2l = gap`

3. 合班复用规则（A 模式）：
- `A1 + A`
- `A + A2`
- `B1 + B2`
- 同职能复用，且按规则优先级执行。

4. 福利目标（软约束）：
- 尽量形成 `>=4` 天连续上班段
- 尽量形成连续休息段，避免过碎
- 在满足硬约束前提下最小化碎片化。

---

## 2. MIP 模型定义

### 2.1 集合

- `I`: 员工集合
- `D`: 日期集合（当周期）
- `S`: 白班班别集合 `{A1, A, A2, B1, B2}`
- `F`: 职能集合（网/天/微/...）
- `P`: 合班对集合 `{(A1,A), (A,A2), (B1,B2)}`

### 2.2 参数

- `demand[d,s,f]`: 最低人力需求（经 `m` 下调后）
- `blocked[i,d] ∈ {0,1}`: 大夜/休整/个性化休假阻塞
- `target[i]`: 应上白班天数
- `extraCap[i] ∈ {0,1,2}`: 人员额外上班上限（由 `n/l` 方案映射）
- `eligible[i,f] ∈ {0,1}`: 员工是否可承担职能 `f`
- `fixedShift[i,s] ∈ {0,1}`: 员工月度固定班别

### 2.3 决策变量

- `x[i,d,s,f] ∈ {0,1}`: 员工 `i` 在 `d` 日上 `s` 班做 `f`
- `u[i,d,p,f] ∈ {0,1}`: 员工 `i` 在 `d` 日按合班对 `p` 复用 `f`
- `y[i,d] ∈ {0,1}`: 员工 `i` 在 `d` 日是否上白班
- `short[d,s,f] >= 0`: 覆盖缺口松弛（严格模式可强制为 0）
- `extra1[i], extra2[i] ∈ {0,1}`: 员工是否被选为 `+1` 或 `+2`
- 连续性辅助变量（线性化）：
  - `workStart[i,d] ∈ {0,1}`：工作段起点
  - `restStart[i,d] ∈ {0,1}`：休息段起点

### 2.4 硬约束

1. 覆盖约束（含合班复用贡献）：
- `sum_i x[i,d,s,f] + mergeContribution[d,s,f] + short[d,s,f] >= demand[d,s,f]`
- 严格模式：`short[d,s,f] = 0`

2. 合班复用映射：
- 若 `p=(s1,s2)`，则 `u` 同时对 `s1` 与 `s2` 提供 1 单位覆盖（同职能）

3. 一人一天只能上一班（含复用）：
- `sum_{s,f} x[i,d,s,f] + sum_{p,f} u[i,d,p,f] <= 1`

4. 阻塞日禁止上白班：
- `blocked[i,d]=1 => x=u=0`

5. 月度白班天数边界：
- `target[i] <= sum_d y[i,d] <= target[i] + extraCap[i]`
- `y[i,d] = sum_{s,f} x[i,d,s,f] + sum_{p,f} u[i,d,p,f]`

6. 固定班别一致性：
- 非固定班别变量强制为 0

7. 职能可行性：
- 若 `eligible[i,f]=0`，对应变量上界为 0

8. `n/l` 人数约束：
- `sum_i extra2[i] = l`
- `sum_i extra1[i] = n`
- `extraCap[i] = extra1[i] + 2*extra2[i]`
- 且 `extra1[i] + extra2[i] <= 1`（同一人只选一种档位）

---

## 3. 目标函数（分层）

建议分层优化（lexicographic）：

1. 第一层（绝对优先）：
- 最小化 `sum short[d,s,f]`

2. 第二层：
- 最小化 `sum_i underTarget_i + overTarget_i`（理论上硬约束下为 0）

3. 第三层（福利连续性）：
- 最小化 `sum workStart + sum restStart`（减少碎片）
- 惩罚短工作段（<4）与短休息段（<2）的线性惩罚项

4. 第四层：
- 职能均衡偏差最小化（员工维度和全局维度）

---

## 4. 与当前系统的衔接

### 4.1 数据流

1. 最低人力页面确定 `m/n/l` 并写入：
- `minimumManpowerConfig.dailyDemand`（已应用 m）
- `minimumManpowerConfig.extraWorkPlan`（已应用 n/l）
- `minimumManpowerConfig.compensationPlan`（保留基线快照）

2. 月度班次生成读取上述配置，组装 MIP 参数后求解。

3. 输出继续沿用：
- `scheduleResultSnapshot`
- `dayShiftReport.stats/meta`
- 月度统计表字段。

### 4.2 月度统计表字段（最终）

- 员工ID
- 姓名
- 当周期总天数
- 大夜天数
- 个性化休假天数
- 应休假总天数
- 实际休假总天数
- 应上白班天数
- 实际安排白班天数
- 最长连续休假天数
- 最长连续上班天数
- 最短连续休假天数
- 最短连续上班天数

---

## 5. JS 实施分期（建议）

### Phase 1（已具备基础）

- 固化 `m/n/l` 口径与校验：`m+n+2l=gap`
- 最低人力下调策略：优先非节假日 + 分散 + 轻微连续
- 月度统计表字段统一

### Phase 2（MIP 求解器接入）

新增：
- `js/solvers/mipDayShiftSolver.js`
  - `generateDayShiftScheduleMIP(params)`
  - 参数来自 minimumManpower + night + requests + staff + daily matrix

控制器：
- `MonthlyScheduleConfigManager.generateMonthlyScheduleConfig()`
  - 增加 `algorithmMode: 'csp'|'mip'`
  - `mip` 模式优先，失败可回退 `csp`（带告警）

### Phase 3（解释性与运营化）

- 输出不可行原因（按日期/班别/职能）
- 输出合班复用明细（哪天、哪对、哪位员工）
- 输出连续性与福利指标对比（优化前/后）

---

## 6. 当前不足（自查）

1. 目前生产求解仍以 CSP 为主，MIP 是设计与接入路线，未完成求解内核落地。  
2. 连续性软约束仍可能出现边缘违例（如 `maxRestViolation`），需要在 MIP 中用更强线性约束收敛。  
3. 合班复用在规则层面已支持，但跨天跨职能优先级可进一步精细化。  
4. 当人员极紧张时，`m/n/l` 可行域可能很窄，需增加“自动可行区间提示”。

---

## 7. 建议

1. 优先上线 `algorithmMode` 切换与 MIP 求解器最小闭环（先覆盖硬约束）。  
2. 再逐步加入福利目标（连续上班/休息）与职能均衡目标，避免一次性模型过重。  
3. 对外保留“不可行解释报告”，帮助业务快速调整 `m/n/l` 与最低人力。  
4. 用历史月份回放做 A/B（CSP vs MIP）评估：缺口满足率、连续性、运行时间三指标并行看。  
