const path = require('path');
const { test, expect } = require('playwright/test');
const {
  SCREENSHOT_PERIOD,
  waitForMonthlyScheduleReady,
  suppressBlockingDialogs,
  setupMonthlyScheduleScenario,
  runMonthlyScheduleSelfRepair,
  captureMonthlyScheduleSnapshot,
  writeMonthlyArtifacts,
  writeBugArtifacts
} = require('./utils/monthly-hard-constraint-fixture');

test.describe('P0 Monthly Schedule Hard Constraints', () => {
  test('TC-P0-MON-01 月度班次配置在截图口径下满足硬约束', async ({ page }, testInfo) => {
    test.setTimeout(240000);
    const runtimeErrors = [];

    page.on('pageerror', (err) => {
      runtimeErrors.push(`pageerror: ${err.message}`);
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        runtimeErrors.push(`console.error: ${msg.text()}`);
      }
    });

    await page.goto('/index.html');
    await waitForMonthlyScheduleReady(page);
    await suppressBlockingDialogs(page);

    const baseline = await setupMonthlyScheduleScenario(page);
    const repairFlow = await runMonthlyScheduleSelfRepair(page);
    const finalSnapshot = repairFlow.finalSnapshot || await captureMonthlyScheduleSnapshot(page);
    const benignRuntimePatterns = [
      /Failed to load resource/i,
      /ERR_CONNECTION_REFUSED/i
    ];
    const actionableRuntimeErrors = runtimeErrors.filter((item) => {
      return !benignRuntimePatterns.some((pattern) => pattern.test(item));
    });

    const payload = {
      title: '月度班次配置硬约束自修复报告',
      caseId: 'TC-P0-MON-01',
      period: SCREENSHOT_PERIOD,
      baseline,
      success: repairFlow.success,
      rounds: repairFlow.rounds,
      runtimeErrors,
      actionableRuntimeErrors,
      finalSnapshot
    };

    const artifactFiles = writeMonthlyArtifacts('p0-monthly-schedule-hard-constraints', payload);

    await testInfo.attach('monthly-hard-constraint-baseline.json', {
      body: JSON.stringify(baseline, null, 2),
      contentType: 'application/json'
    });

    await testInfo.attach('monthly-hard-constraint-rounds.json', {
      body: JSON.stringify(repairFlow.rounds, null, 2),
      contentType: 'application/json'
    });

    await testInfo.attach('monthly-hard-constraint-final-snapshot.json', {
      body: JSON.stringify(finalSnapshot, null, 2),
      contentType: 'application/json'
    });

    await testInfo.attach('monthly-hard-constraint-report-json-path.txt', {
      body: artifactFiles.jsonPath,
      contentType: 'text/plain'
    });

    await testInfo.attach('monthly-hard-constraint-report-md-path.txt', {
      body: artifactFiles.mdPath,
      contentType: 'text/plain'
    });

    const issues = [];
    if (!repairFlow.success) {
      const lastRound = repairFlow.rounds[repairFlow.rounds.length - 1] || {};
      issues.push({
        severity: 'P0',
        module: 'M10',
        title: '月度班次配置未收敛到硬约束满足状态',
        expected: 'hardViolations.total=0 且 dailyShortage=0',
        actual: `total=${lastRound.hard ? lastRound.hard.total : 'NA'}, dailyShortage=${lastRound.hard ? lastRound.hard.dailyShortage : 'NA'}`,
        reproSteps: '初始化截图场景后执行月度班次配置多轮自修复',
        evidence: artifactFiles.jsonPath
      });
    }

    if ((finalSnapshot.monthlySchedule.hardViolations || {}).total > 0) {
      issues.push({
        severity: 'P0',
        module: 'M10',
        title: '最终快照仍存在硬约束违约',
        expected: '最终 hardViolations.total = 0',
        actual: JSON.stringify(finalSnapshot.monthlySchedule.hardViolations || {}),
        reproSteps: '执行月度班次配置硬约束自修复用例',
        evidence: artifactFiles.jsonPath
      });
    }

    const finalRound = repairFlow.rounds[repairFlow.rounds.length - 1] || {};
    const finalWarnings = Array.isArray(finalRound.warnings) ? finalRound.warnings : [];
    const imbalanceWarnings = finalWarnings.filter((item) => /网天微差异超阈值/.test(String(item || '')));
    if (imbalanceWarnings.length > 0) {
      issues.push({
        severity: 'P1',
        module: 'M10',
        title: '职能均衡仍有超阈值告警',
        expected: '最终结果不出现“网天微差异超阈值”告警',
        actual: imbalanceWarnings.join(' | '),
        reproSteps: '执行月度班次配置硬约束自修复用例',
        evidence: artifactFiles.jsonPath
      });
    }

    if (actionableRuntimeErrors.length > 0) {
      actionableRuntimeErrors.slice(0, 10).forEach((item) => {
        issues.push({
          severity: 'P1',
          module: 'Runtime',
          title: '运行期控制台错误',
          expected: '月度班次链路运行过程中不出现 console.error/pageerror',
          actual: item,
          reproSteps: '执行月度班次配置硬约束自修复用例',
          evidence: item
        });
      });
    }

    const bugPayload = {
      title: 'P0 月度班次配置硬约束 Bug 报告',
      caseId: 'TC-P0-MON-01',
      issues,
      runtimeErrors,
      actionableRuntimeErrors,
      baseline,
      rounds: repairFlow.rounds,
      finalSnapshot
    };
    const bugFiles = writeBugArtifacts('p0-monthly-schedule-hard-constraints-bugs', bugPayload);

    await testInfo.attach('monthly-hard-constraint-bug-json-path.txt', {
      body: bugFiles.jsonPath,
      contentType: 'text/plain'
    });

    await testInfo.attach('monthly-hard-constraint-bug-md-path.txt', {
      body: bugFiles.mdPath,
      contentType: 'text/plain'
    });

    if (issues.length > 0) {
      await page.screenshot({
        path: path.resolve('artifacts', 'monthly-hard-constraint', 'p0-monthly-hard-constraint-failure.png'),
        fullPage: true
      });
    }

    expect(
      issues,
      `检测到 ${issues.length} 个问题，详情见 ${bugFiles.mdPath}`
    ).toEqual([]);
  });
});
