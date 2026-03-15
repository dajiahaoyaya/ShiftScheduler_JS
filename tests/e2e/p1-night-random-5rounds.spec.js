const { test, expect } = require('playwright/test');
const {
  waitForAppReady,
  setupBaselineState,
  runNightShiftRounds,
  writeBugArtifacts
} = require('./utils/scheduler-fixture');

test.describe('P1 Night Shift Random Stability', () => {
  test('TC-P1-01 连续5轮大夜生成不破坏硬约束', async ({ page }, testInfo) => {
    test.setTimeout(300000);
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
    const rounds = await runNightShiftRounds(page, 5, { algorithm: 'legacy' });

    const allIssues = rounds.details.flatMap((x) =>
      (x.issues || []).map((issue) => ({ round: x.round, ...issue }))
    );

    const rootCauseHit = runtimeErrors.find((x) => x.includes("Identifier 'regionConfig' has already been declared"));
    if (rootCauseHit) {
      allIssues.push({
        round: 0,
        severity: 'P1',
        module: 'M07',
        title: 'nightShift.js 脚本运行时异常',
        expected: 'nightShift.js 正常加载且无语法/声明冲突',
        actual: rootCauseHit,
        reproSteps: '打开首页加载脚本',
        evidence: rootCauseHit
      });
    }

    const payload = {
      title: 'P1 随机5轮 Bug 报告',
      caseId: 'TC-P1-01',
      baseline,
      rounds,
      runtimeErrors,
      issues: allIssues
    };

    const bugFiles = writeBugArtifacts('p1-random-5rounds-bugs', payload);

    await testInfo.attach('p1-rounds.json', {
      body: JSON.stringify(rounds, null, 2),
      contentType: 'application/json'
    });

    await testInfo.attach('p1-bug-json-path.txt', {
      body: bugFiles.jsonPath,
      contentType: 'text/plain'
    });

    await testInfo.attach('p1-bug-markdown-path.txt', {
      body: bugFiles.mdPath,
      contentType: 'text/plain'
    });

    expect(
      allIssues,
      `5轮累计检测到 ${allIssues.length} 个问题，详情见 ${bugFiles.mdPath}`
    ).toEqual([]);
  });
});
