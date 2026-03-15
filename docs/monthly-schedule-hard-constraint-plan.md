# 月度班次配置硬约束闭环计划

## 目标

在固定排班周期 `2026-01-26` 至 `2026-02-25` 下，使用 `人员配置 - sh.xlsx`、截图口径的个性化休假，以及默认最低人力基线，稳定生成满足 `hardViolations.total = 0` 且 `dailyShortage = 0` 的本月排班配置。

## 依赖链

1. 排班周期管理
   - 固定周期：`2026-01-26 ~ 2026-02-25`
   - 固定法休：`2026-01-31, 2026-02-01, 2026-02-07, 2026-02-08, 2026-02-15 ~ 2026-02-23`
2. 人员管理配置
   - 数据源：`人员配置 - sh.xlsx`
   - 所有人统一补充 `annualLeaveDays = 10`，避免截图中的年假请求被配额误伤
3. 个性化休假配置
   - 按截图风格写入一组确定性的 `ANNUAL/LEGAL` 请求
   - 未在截图中明确展示的人员默认不加请求
4. 每日最低人力配置
   - 使用仓库现有回归基线 `MINIMUM_MANPOWER_PATTERN`
   - 不主动下调需求，不改变硬约束目标
5. 本月排班配置
   - 由 `MonthlyScheduleConfigManager.generateMonthlyScheduleConfig()` 负责求解
   - 内部优先 MIP，并自带休假重排、班别重分、MIP/CSP 回退

## 多轮自修复策略

### 轮次 R1: 严格 MIP 基线
- `strictMIP = true`
- `maxExtraDayPerStaff = 1`
- `functionBalanceM = 2`
- 目标：在不放宽求解策略的前提下直接收敛

### 轮次 R2: 严格 MIP 增强
- 仍保持 `strictMIP = true`
- 提高 `maxIterations/backtrackLimit`
- `maxExtraDayPerStaff = 2`
- `functionBalanceM = 3`
- 目标：给同一硬目标更多搜索空间

### 轮次 R3: 允许回退 CSP
- `strictMIP = false`
- 继续保留较高迭代与回溯上限
- 目标：若 MIP 难以收敛，则允许使用仓库内置 CSP 兜底

### 轮次 R4: 额外上班 +1 后重跑
- 不下调任何最低人力目标
- 仅调用 `MinimumManpowerManager.applyExtraWorkPlusOne()` 增加可用容量
- 然后重新执行 R3 级别求解

### 轮次 R5: 额外上班 +2 后重跑
- 仍不下调硬约束目标
- 调用 `MinimumManpowerManager.applyExtraWorkPlusTwo()`
- 作为最后一级容量补偿后重跑求解

## 持久化方式

1. 浏览器内状态
   - 所有配置仍走 `Store.saveState()` + IndexedDB
2. 测试工件
   - `artifacts/monthly-hard-constraint/p0-monthly-schedule-hard-constraints.json`
   - `artifacts/monthly-hard-constraint/p0-monthly-schedule-hard-constraints.md`
3. Bug 工件
   - `artifacts/bugs/p0-monthly-schedule-hard-constraints-bugs.json`
   - `artifacts/bugs/p0-monthly-schedule-hard-constraints-bugs.md`

## Playwright 执行入口

- 用例：`tests/e2e/p0-monthly-schedule-hard-constraints.spec.js`
- 命令：`npm run pw:test:monthly`

## 判定口径

满足以下条件才视为通过：

1. 最终 `hardViolations.total = 0`
2. 最终 `hardViolations.dailyShortage = 0`
3. 测试过程中无新增运行时脚本错误
4. 所有轮次与最终快照均成功落盘

## 失败后的人工接力点

1. 先看 `artifacts/monthly-hard-constraint/*.md` 中哪一轮首次明显收敛
2. 再看 `shiftShortageRebalance` 与 `specialRestRebalance` 是否仍存在未消化缺口
3. 若 R5 仍失败，再回到业务层确认：
   - 最低人力基线是否超过当前人力上限
   - 个性化休假是否存在集中阻塞
   - 是否需要补充真实人员或调整业务目标
