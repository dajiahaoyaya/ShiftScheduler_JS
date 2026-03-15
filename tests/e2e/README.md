# Playwright 自动化测试

## 目标
- 覆盖 Chromium 环境下的核心主链路（P0）与夜班随机稳定性（P1）。
- 自动输出 bug 证据（JSON + Markdown）。

## 用例映射
- `tests/e2e/p0-main-flow.spec.js`
  - TC-P0-01 创建并激活排班周期
  - TC-P0-02 导入并激活人员配置
  - TC-P0-03 构造个性化休假并校验口径
  - TC-P0-04 写入每日最低人力基线
  - TC-P0-05 夜班单轮生成硬约束检查
- `tests/e2e/p0-monthly-schedule-hard-constraints.spec.js`
  - TC-P0-MON-01 月度班次配置在截图口径下多轮自修复并满足硬约束
- `tests/e2e/p1-night-random-5rounds.spec.js`
  - TC-P1-01 夜班连续5轮随机生成稳定性
- `tests/e2e/p1-vacation-conflict-guard.spec.js`
  - TC-P1-02 分散分配休假冲突防回归（ANNUAL/LEGAL/REQ）
- `tests/e2e/p1-vacation-conflict-extended.spec.js`
  - TC-P1-03 分散分配随机5轮休假冲突防回归（ANNUAL/LEGAL/REQ/SICK）
  - TC-P1-04 连续分配候选段休假冲突防回归（ANNUAL/LEGAL/REQ/SICK）

## 运行
- `npm run pw:test:p0`
- `npm run pw:test:monthly`
- `npm run pw:test:p1`
- `npm run pw:test:p1:vacation`
- `npm run pw:test:p1:vacation:extended`
- `npm run pw:test:regression`（P0 + 全部 P1，并输出汇总）
- `npm run pw:test`
- `npm run pw:report`

## 输出
- Playwright 报告：`playwright-report/`
- bug 文件：`artifacts/bugs/*.json`、`artifacts/bugs/*.md`

## Bug 分级
- `P0`：主链路不可用、每日大夜人数低于下限
- `P1`：规则冲突、验证失败、排班违规
- `P2`：展示与交互问题（本批次未自动化覆盖）
