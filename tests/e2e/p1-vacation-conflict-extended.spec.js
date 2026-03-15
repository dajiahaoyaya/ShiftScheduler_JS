const path = require('path');
const { test, expect } = require('playwright/test');
const {
  waitForAppReady,
  writeBugArtifacts
} = require('./utils/scheduler-fixture');

test.describe('P1 Vacation Conflict Extended', () => {
  test('TC-P1-03 分散分配随机5轮不命中休假冲突', async ({ page }, testInfo) => {
    test.setTimeout(180000);
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
      function seededRandom(seed) {
        let value = seed % 2147483647;
        if (value <= 0) value += 2147483646;
        return function rand() {
          value = (value * 16807) % 2147483647;
          return (value - 1) / 2147483646;
        };
      }

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

      function pickUniqueDates(rng, dates, count) {
        const pool = dates.slice();
        const picked = [];
        while (pool.length > 0 && picked.length < count) {
          const idx = Math.floor(rng() * pool.length);
          picked.push(pool[idx]);
          pool.splice(idx, 1);
        }
        return picked;
      }

      const issues = [];
      if (typeof NightShiftSolver === 'undefined') {
        issues.push({
          severity: 'P0',
          module: 'M07',
          title: 'NightShiftSolver 不可用',
          expected: 'NightShiftSolver 可调用',
          actual: 'window.NightShiftSolver === undefined',
          reproSteps: '打开首页后执行分散分配随机回归用例',
          evidence: 'NightShiftSolver missing'
        });
        return { issues, issueCount: issues.length, details: [], uniqueFingerprints: 0 };
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

      const details = [];
      const fingerprints = new Set();
      const dateList = buildDateList('2026-03-01', '2026-03-31');
      const dateKeys = dateList.map((d) => d.dateStr);

      for (let roundNo = 1; roundNo <= 5; roundNo += 1) {
        const rng = seededRandom(20260300 + roundNo);
        const staff = {
          id: `UTR-${roundNo}`,
          staffId: `UTR-${roundNo}`,
          name: `UT-随机-${roundNo}`,
          gender: roundNo % 2 === 0 ? '女' : '男',
          location: '上海'
        };
        const staffId = String(staff.staffId || staff.id);
        const sampled = pickUniqueDates(rng, dateKeys, 8);
        const personalRequests = {
          [staffId]: {
            [sampled[0]]: 'ANNUAL',
            [sampled[1]]: 'ANNUAL',
            [sampled[2]]: 'LEGAL',
            [sampled[3]]: 'LEGAL',
            [sampled[4]]: 'REQ',
            [sampled[5]]: 'REQ',
            [sampled[6]]: 'SICK'
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
          6,
          personalRequests,
          restDays,
          {},
          usedDates,
          2,
          2,
          '上海'
        );

        const scheduledNightDates = Object.keys(schedule[staffId] || {})
          .filter((d) => schedule[staffId][d] === 'NIGHT')
          .sort();
        const conflictDates = scheduledNightDates.filter((dateStr) => {
          const reqType = personalRequests?.[staffId]?.[dateStr];
          return reqType === 'ANNUAL' || reqType === 'LEGAL' || reqType === 'REQ' || reqType === 'SICK';
        });
        const fingerprint = JSON.stringify(scheduledNightDates);
        fingerprints.add(fingerprint);

        if (conflictDates.length > 0) {
          conflictDates.forEach((dateStr) => {
            const reqType = personalRequests[staffId][dateStr];
            issues.push({
              severity: 'P1',
              module: 'M07',
              title: '分散分配随机轮次命中休假冲突',
              expected: 'ANNUAL/LEGAL/REQ/SICK 日期不可被分配 NIGHT',
              actual: `${staffId} 在 ${dateStr} 被排 NIGHT，休假类型=${reqType}`,
              reproSteps: '执行 NightShiftSolver.assignDistributedForStaff 随机5轮回归',
              evidence: `round=${roundNo}, staffId=${staffId}, date=${dateStr}, reqType=${reqType}`
            });
          });
        }

        details.push({
          roundNo,
          staffId,
          assignedDates,
          scheduledNightDates,
          conflictDates,
          personalRequests: personalRequests[staffId]
        });
      }

      return {
        issueCount: issues.length,
        issues,
        uniqueFingerprints: fingerprints.size,
        details
      };
    });

    const payload = {
      title: 'P1 分散分配随机5轮休假冲突防回归 Bug 报告',
      caseId: 'TC-P1-03',
      round,
      runtimeErrors,
      issues: round.issues || []
    };

    const bugFiles = writeBugArtifacts('p1-vacation-conflict-random-5rounds-bugs', payload);

    await testInfo.attach('p1-vacation-random-round.json', {
      body: JSON.stringify(round, null, 2),
      contentType: 'application/json'
    });

    await testInfo.attach('p1-vacation-random-bug-json-path.txt', {
      body: bugFiles.jsonPath,
      contentType: 'text/plain'
    });

    await testInfo.attach('p1-vacation-random-bug-markdown-path.txt', {
      body: bugFiles.mdPath,
      contentType: 'text/plain'
    });

    if ((round.issueCount || 0) > 0) {
      await page.screenshot({
        path: path.resolve('artifacts', 'bugs', 'p1-vacation-conflict-random-5rounds-failure.png'),
        fullPage: true
      });
    }

    expect(
      round.issues || [],
      `检测到 ${(round.issueCount || 0)} 个问题，详情见 ${bugFiles.mdPath}`
    ).toEqual([]);
  });

  test('TC-P1-04 连续分配候选段不命中休假冲突', async ({ page }, testInfo) => {
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
          reproSteps: '打开首页后执行连续分配候选段回归用例',
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

      const dateList = buildDateList('2026-04-01', '2026-04-12');
      const personalRequests = {
        '2026-04-01': 'ANNUAL',
        '2026-04-02': 'LEGAL',
        '2026-04-03': 'REQ',
        '2026-04-04': 'SICK'
      };
      const restDays = {};
      const usedDates = new Set();
      const schedule = {};

      const period = NightShiftSolver.findAvailableContinuousPeriod(
        dateList,
        3,
        personalRequests,
        restDays,
        new Set(),
        usedDates,
        schedule,
        [],
        3,
        {},
        2,
        '上海',
        4,
        0
      ) || [];

      const conflictDates = period.filter((dateStr) => {
        const reqType = personalRequests?.[dateStr];
        return reqType === 'ANNUAL' || reqType === 'LEGAL' || reqType === 'REQ' || reqType === 'SICK';
      });

      if (conflictDates.length > 0) {
        conflictDates.forEach((dateStr) => {
          const reqType = personalRequests[dateStr];
          issues.push({
            severity: 'P1',
            module: 'M07',
            title: '连续分配候选段命中休假冲突',
            expected: '连续候选段应避开 ANNUAL/LEGAL/REQ/SICK',
            actual: `候选段包含 ${dateStr}，休假类型=${reqType}`,
            reproSteps: '执行 NightShiftSolver.findAvailableContinuousPeriod 回归用例',
            evidence: `date=${dateStr}, reqType=${reqType}, period=${JSON.stringify(period)}`
          });
        });
      }

      return {
        issueCount: issues.length,
        issues,
        detail: {
          period,
          conflictDates,
          personalRequests
        }
      };
    });

    const payload = {
      title: 'P1 连续分配候选段休假冲突防回归 Bug 报告',
      caseId: 'TC-P1-04',
      round,
      runtimeErrors,
      issues: round.issues || []
    };

    const bugFiles = writeBugArtifacts('p1-vacation-conflict-continuous-guard-bugs', payload);

    await testInfo.attach('p1-vacation-continuous-round.json', {
      body: JSON.stringify(round, null, 2),
      contentType: 'application/json'
    });

    await testInfo.attach('p1-vacation-continuous-bug-json-path.txt', {
      body: bugFiles.jsonPath,
      contentType: 'text/plain'
    });

    await testInfo.attach('p1-vacation-continuous-bug-markdown-path.txt', {
      body: bugFiles.mdPath,
      contentType: 'text/plain'
    });

    if ((round.issueCount || 0) > 0) {
      await page.screenshot({
        path: path.resolve('artifacts', 'bugs', 'p1-vacation-conflict-continuous-guard-failure.png'),
        fullPage: true
      });
    }

    expect(
      round.issues || [],
      `检测到 ${(round.issueCount || 0)} 个问题，详情见 ${bugFiles.mdPath}`
    ).toEqual([]);
  });
});
