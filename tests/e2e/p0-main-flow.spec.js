const path = require('path');
const { test, expect } = require('playwright/test');
const {
  waitForAppReady,
  setupBaselineState,
  runNightShiftRound,
  writeBugArtifacts
} = require('./utils/scheduler-fixture');

test.describe('P0 Main Flow', () => {
  test('TC-P0-01..05 核心主链路可执行并满足硬约束', async ({ page }, testInfo) => {
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
    await waitForAppReady(page);

    const baseline = await setupBaselineState(page);

    expect(baseline.active.schedulePeriodConfigId).toBeTruthy();
    expect(baseline.active.staffConfigId).toBeTruthy();
    expect(baseline.active.requestConfigId).toBeTruthy();

    expect(baseline.counts.staff).toBeGreaterThanOrEqual(8);
    expect(baseline.counts.legalRestDays).toBe(13);
    expect(baseline.counts.minimumManpowerDays).toBe(31);

    const allHaveAnnual = baseline.requestStats.every((x) => x.annualCount >= 1);
    const allHaveLegal = baseline.requestStats.every((x) => x.legalCount >= 1);
    const all8Covered = baseline.blockCoverage.every((x) => x.coveredDays.length === 4);

    expect(allHaveAnnual).toBeTruthy();
    expect(allHaveLegal).toBeTruthy();
    expect(all8Covered).toBeTruthy();

    expect(baseline.quota.legalRestDayCount).toBe(13);

    const round = await runNightShiftRound(page, { algorithm: 'legacy' });

    const rootCauseHit = runtimeErrors.find((x) => x.includes("Identifier 'regionConfig' has already been declared"));
    if (rootCauseHit) {
      round.issues.push({
        severity: 'P1',
        module: 'M07',
        title: 'nightShift.js 脚本运行时异常',
        expected: 'nightShift.js 正常加载且无语法/声明冲突',
        actual: rootCauseHit,
        reproSteps: '打开首页加载脚本',
        evidence: rootCauseHit
      });
      round.issueCount = round.issues.length;
    }

    const payload = {
      title: 'P0 主链路 Bug 报告',
      caseId: 'TC-P0-01..05',
      baseline,
      round,
      runtimeErrors,
      issues: round.issues
    };

    const bugFiles = writeBugArtifacts('p0-main-flow-bugs', payload);

    await testInfo.attach('p0-baseline.json', {
      body: JSON.stringify(baseline, null, 2),
      contentType: 'application/json'
    });

    await testInfo.attach('p0-round.json', {
      body: JSON.stringify(round, null, 2),
      contentType: 'application/json'
    });

    await testInfo.attach('p0-bug-json-path.txt', {
      body: bugFiles.jsonPath,
      contentType: 'text/plain'
    });

    await testInfo.attach('p0-bug-markdown-path.txt', {
      body: bugFiles.mdPath,
      contentType: 'text/plain'
    });

    if (round.issueCount > 0) {
      await page.screenshot({
        path: path.resolve('artifacts', 'bugs', 'p0-main-flow-failure.png'),
        fullPage: true
      });
    }

    expect(
      round.issues,
      `检测到 ${round.issueCount} 个问题，详情见 ${bugFiles.mdPath}`
    ).toEqual([]);
  });
});
