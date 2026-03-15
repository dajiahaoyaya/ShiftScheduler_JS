const path = require('path');
const { test, expect } = require('playwright/test');
const {
  waitForAppReady,
  writeBugArtifacts
} = require('./utils/scheduler-fixture');

test.describe('P1 Vacation Conflict Guard', () => {
  test('TC-P1-02 分散分配不应命中 ANNUAL/LEGAL/REQ', async ({ page }, testInfo) => {
    test.setTimeout(120000);
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

    const round = await page.evaluate(() => {
      function buildDateList(startDate, endDate) {
        const list = [];
        const cursor = new Date(startDate);
        const end = new Date(endDate);
        while (cursor <= end) {
          const y = cursor.getFullYear();
          const m = String(cursor.getMonth() + 1).padStart(2, '0');
          const d = String(cursor.getDate()).padStart(2, '0');
          list.push(`${y}-${m}-${d}`);
          cursor.setDate(cursor.getDate() + 1);
        }
        return list.map((dateStr) => ({ dateStr }));
      }

      const issues = [];
      if (typeof NightShiftSolver === 'undefined') {
        issues.push({
          severity: 'P0',
          module: 'M07',
          title: 'NightShiftSolver 不可用',
          expected: 'NightShiftSolver 可调用',
          actual: 'window.NightShiftSolver === undefined',
          reproSteps: '打开首页后执行分散分配回归用例',
          evidence: 'NightShiftSolver missing'
        });
        return { issues, issueCount: issues.length, detail: null };
      }

      if (typeof NightShiftConfigRules !== 'undefined') {
        const config = JSON.parse(JSON.stringify(
          (NightShiftConfigRules.getConfig && NightShiftConfigRules.getConfig()) ||
          NightShiftConfigRules.defaultConfig ||
          {}
        ));
        config.constraints = config.constraints || {};
        config.constraints.checkVacationConflict = true;
        config.constraints.vacationStrictMode = true;
        config.constraints.vacationSkipLegal = true;
        config.constraints.vacationSkipReq = true;
        config.constraints.checkMenstrualPeriod = false;
        if (NightShiftConfigRules.setConfig) {
          NightShiftConfigRules.setConfig(config);
        }
      }

      const staff = {
        id: 'UT-1001',
        staffId: 'UT-1001',
        name: 'UT-回归样本',
        gender: '男',
        location: '上海'
      };
      const staffId = String(staff.staffId || staff.id);
      const dateList = buildDateList('2026-03-01', '2026-03-10');
      const personalRequests = {
        [staffId]: {
          '2026-03-02': 'ANNUAL',
          '2026-03-03': 'LEGAL',
          '2026-03-04': 'REQ'
        }
      };

      const schedule = { [staffId]: {} };
      const mandatoryRestDays = { [staffId]: [] };
      const usedDates = new Set();
      const restDays = {};

      const assignedDates = NightShiftSolver.assignDistributedForStaff(
        schedule,
        mandatoryRestDays,
        staff,
        dateList,
        5,
        personalRequests,
        restDays,
        {},
        usedDates,
        1,
        2,
        '上海'
      );

      const scheduledNightDates = Object.keys(schedule[staffId] || {})
        .filter((d) => schedule[staffId][d] === 'NIGHT')
        .sort();

      const conflictDates = scheduledNightDates.filter((dateStr) => {
        const reqType = personalRequests?.[staffId]?.[dateStr];
        return reqType === 'ANNUAL' || reqType === 'LEGAL' || reqType === 'REQ';
      });

      if (conflictDates.length > 0) {
        conflictDates.forEach((dateStr) => {
          const reqType = personalRequests[staffId][dateStr];
          issues.push({
            severity: 'P1',
            module: 'M07',
            title: '分散分配命中休假冲突',
            expected: 'ANNUAL/LEGAL/REQ 日期不可被分配 NIGHT',
            actual: `${staffId} 在 ${dateStr} 被排 NIGHT，休假类型=${reqType}`,
            reproSteps: '执行 NightShiftSolver.assignDistributedForStaff 回归用例',
            evidence: `staffId=${staffId}, date=${dateStr}, reqType=${reqType}`
          });
        });
      }

      return {
        issueCount: issues.length,
        issues,
        detail: {
          staffId,
          assignedDates,
          scheduledNightDates,
          conflictDates,
          personalRequests: personalRequests[staffId]
        }
      };
    });

    const payload = {
      title: 'P1 分散分配休假冲突防回归 Bug 报告',
      caseId: 'TC-P1-02',
      round,
      runtimeErrors,
      issues: round.issues || []
    };

    const bugFiles = writeBugArtifacts('p1-vacation-conflict-guard-bugs', payload);

    await testInfo.attach('p1-vacation-guard-round.json', {
      body: JSON.stringify(round, null, 2),
      contentType: 'application/json'
    });

    await testInfo.attach('p1-vacation-guard-bug-json-path.txt', {
      body: bugFiles.jsonPath,
      contentType: 'text/plain'
    });

    await testInfo.attach('p1-vacation-guard-bug-markdown-path.txt', {
      body: bugFiles.mdPath,
      contentType: 'text/plain'
    });

    if ((round.issueCount || 0) > 0) {
      await page.screenshot({
        path: path.resolve('artifacts', 'bugs', 'p1-vacation-conflict-guard-failure.png'),
        fullPage: true
      });
    }

    expect(
      round.issues || [],
      `检测到 ${(round.issueCount || 0)} 个问题，详情见 ${bugFiles.mdPath}`
    ).toEqual([]);
  });
});
