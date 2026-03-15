const fs = require('fs');
const path = require('path');

const PERIOD = {
  startDate: '2026-01-26',
  endDate: '2026-02-25',
  year: 2026,
  month: 2
};

const LEGAL_REST_DATES = [
  '2026-01-31',
  '2026-02-01',
  '2026-02-07',
  '2026-02-08',
  '2026-02-15',
  '2026-02-16',
  '2026-02-17',
  '2026-02-18',
  '2026-02-19',
  '2026-02-20',
  '2026-02-21',
  '2026-02-22',
  '2026-02-23'
];

const SPECIAL_BLOCK_DATES = [
  '2026-02-15',
  '2026-02-16',
  '2026-02-17',
  '2026-02-18'
];

const MINIMUM_MANPOWER_PATTERN = {
  A1: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2],
  A: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2],
  A2: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  B1: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2],
  B2: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2]
};

function ensureArtifactsDir() {
  const dir = path.resolve(process.cwd(), 'artifacts', 'bugs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function writeBugArtifacts(name, payload) {
  const dir = ensureArtifactsDir();
  const jsonPath = path.join(dir, `${name}.json`);
  const mdPath = path.join(dir, `${name}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(mdPath, renderBugMarkdown(payload), 'utf8');
  return { jsonPath, mdPath };
}

function renderBugMarkdown(payload) {
  const lines = [];
  lines.push(`# ${payload.title}`);
  lines.push('');
  lines.push(`- 时间: ${new Date().toISOString()}`);
  lines.push(`- 用例: ${payload.caseId}`);
  lines.push(`- 发现问题数: ${payload.issues.length}`);
  lines.push('');

  payload.issues.forEach((issue, index) => {
    lines.push(`## ${index + 1}. [${issue.severity}] ${issue.title}`);
    lines.push('');
    lines.push(`- 模块: ${issue.module}`);
    lines.push(`- 预期: ${issue.expected}`);
    lines.push(`- 实际: ${issue.actual}`);
    lines.push(`- 复现步骤: ${issue.reproSteps}`);
    lines.push(`- 证据: ${issue.evidence}`);
    lines.push('');
  });

  return lines.join('\n');
}

async function waitForAppReady(page) {
  await page.waitForFunction(() => {
    return typeof Store !== 'undefined' &&
      typeof DB !== 'undefined' &&
      typeof DataLoader !== 'undefined' &&
      typeof BasicRestSolver !== 'undefined' &&
      typeof IncrementalNightShiftSolver !== 'undefined';
  }, null, { timeout: 90000 });
}

async function setupBaselineState(page) {
  return page.evaluate(async ({ period, legalRestDates, specialBlockDates, minimumPattern }) => {
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
      return list;
    }

    function pickRandomDate(rng, dates, forbiddenSet = null) {
      const allowed = forbiddenSet
        ? dates.filter((d) => !forbiddenSet.has(d))
        : dates.slice();
      if (allowed.length === 0) {
        return dates[Math.floor(rng() * dates.length)];
      }
      return allowed[Math.floor(rng() * allowed.length)];
    }

    if (!Store || !DB) {
      throw new Error('Store/DB not available in page context');
    }

    // 1) 周期与法定休息日
    const restDays = {};
    legalRestDates.forEach((d) => {
      restDays[d] = true;
    });

    const periodConfigId = Store.createSchedulePeriodConfig(
      'PW-202602-排班周期',
      {
        startDate: period.startDate,
        endDate: period.endDate,
        year: period.year,
        month: period.month
      },
      restDays
    );
    await Store.setActiveSchedulePeriodConfig(periodConfigId);

    // 2) 导入人员配置并激活
    const staffResp = await fetch('./人员配置 - sh.xlsx');
    if (!staffResp.ok) {
      throw new Error(`fetch 人员配置文件失败: ${staffResp.status}`);
    }

    const staffBlob = await staffResp.blob();
    const staffFile = new File([staffBlob], '人员配置 - sh.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const parsedStaff = await DataLoader.loadExcelFile(staffFile);
    const enrichedStaff = parsedStaff.map((s) => ({
      ...s,
      annualLeaveDays: 1,
      sickLeaveDays: 0
    }));

    Store.batchAddStaffData(enrichedStaff);
    const staffConfigId = Store.createStaffConfig('PW-202602-人员配置');
    await Store.setActiveConfig(staffConfigId);

    const staffData = Store.getCurrentStaffData();
    const staffIds = staffData.map((s) => String(s.id)).sort();

    if (staffIds.length < 8) {
      throw new Error(`人员数量不足8人，当前仅 ${staffIds.length} 人`);
    }

    // 3) 生成特殊休假
    const dateList = buildDateList(period.startDate, period.endDate);
    const rng = seededRandom(20260213);

    const shuffledIds = staffIds.slice();
    for (let i = shuffledIds.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = shuffledIds[i];
      shuffledIds[i] = shuffledIds[j];
      shuffledIds[j] = tmp;
    }

    const selected8 = shuffledIds.slice(0, 8);
    const selectedSet = new Set(selected8);

    const allRequests = {};
    staffIds.forEach((id) => {
      allRequests[id] = {};
    });

    // 先写入8人连休4天（普通休）
    selected8.forEach((id) => {
      specialBlockDates.forEach((d) => {
        allRequests[id][d] = 'LEGAL';
      });
    });

    // 每人补齐：1天ANNUAL + 1天非年假(LEGAL)
    staffIds.forEach((id) => {
      const currentDates = new Set(Object.keys(allRequests[id] || {}));
      const annualForbidden = selectedSet.has(id) ? new Set(specialBlockDates) : null;

      const annualDate = pickRandomDate(rng, dateList, annualForbidden);
      allRequests[id][annualDate] = 'ANNUAL';
      currentDates.add(annualDate);

      // 非年假允许重复命中已有LEGAL，不额外限制
      let legalDate = pickRandomDate(rng, dateList, null);
      if (legalDate === annualDate) {
        const fallbackForbidden = new Set([annualDate]);
        legalDate = pickRandomDate(rng, dateList, fallbackForbidden);
      }
      if (!allRequests[id][legalDate] || allRequests[id][legalDate] !== 'ANNUAL') {
        allRequests[id][legalDate] = 'LEGAL';
      }
    });

    const requestConfigId = Store.createRequestConfig(
      'PW-202602-个性化休假',
      allRequests,
      restDays
    );
    await Store.setActiveRequestConfig(requestConfigId);

    // 4) 每日最低人力配置（31天）
    if (minimumPattern.A1.length !== dateList.length) {
      throw new Error(`最低人力配置长度错误: ${minimumPattern.A1.length} != ${dateList.length}`);
    }

    const dailyDemand = {};
    dateList.forEach((dateStr, idx) => {
      dailyDemand[dateStr] = {
        A1: minimumPattern.A1[idx],
        A: minimumPattern.A[idx],
        A2: minimumPattern.A2[idx],
        B1: minimumPattern.B1[idx],
        B2: minimumPattern.B2[idx]
      };
    });

    const minimumManpowerConfig = {
      periodKey: `${period.startDate}_${period.endDate}`,
      weekdayTemplate: { A1: 2, A: 2, A2: 1, B1: 2, B2: 3 },
      specialTemplate: { A1: 1, A: 1, A2: 1, B1: 2, B2: 2 },
      dailyDemand
    };
    Store.updateState({ minimumManpowerConfig }, true);

    // 5) 配额校验快照
    const quotaSnapshot = BasicRestSolver.processBasicRestRules({
      staffData: Store.getCurrentStaffData(),
      personalRequests: Store.getAllPersonalRequests(),
      restDays: Store.getAllRestDays(),
      scheduleConfig: Store.getState('scheduleConfig')
    });

    const allRequestsNow = Store.getAllPersonalRequests();
    const requestStats = staffIds.map((id) => {
      const req = allRequestsNow[id] || {};
      const annualCount = Object.values(req).filter((v) => v === 'ANNUAL').length;
      const legalCount = Object.values(req).filter((v) => v === 'LEGAL').length;
      return { id, annualCount, legalCount, total: annualCount + legalCount };
    });

    const blockCoverage = selected8.map((id) => {
      const req = allRequestsNow[id] || {};
      const coveredDays = specialBlockDates.filter((d) => req[d] === 'LEGAL');
      return { id, coveredDays };
    });

    return {
      active: {
        schedulePeriodConfigId: Store.getState('activeSchedulePeriodConfigId'),
        staffConfigId: Store.getState('activeConfigId'),
        requestConfigId: Store.getState('activeRequestConfigId')
      },
      counts: {
        staff: staffIds.length,
        legalRestDays: Object.keys(Store.getAllRestDays() || {}).length,
        minimumManpowerDays: Object.keys(minimumManpowerConfig.dailyDemand || {}).length
      },
      selected8,
      blockCoverage,
      requestStats,
      quota: {
        legalRestDayCount: quotaSnapshot.stats.legalRestDayCount,
        warnings: quotaSnapshot.warnings || []
      }
    };
  }, {
    period: PERIOD,
    legalRestDates: LEGAL_REST_DATES,
    specialBlockDates: SPECIAL_BLOCK_DATES,
    minimumPattern: MINIMUM_MANPOWER_PATTERN
  });
}

async function runNightShiftRound(page, options = {}) {
  const algorithm = options.algorithm || 'legacy';

  return page.evaluate(async ({ algorithm }) => {
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
      return list;
    }

    const issues = [];
    const staffData = Store.getCurrentStaffData();
    const scheduleConfig = Store.getState('scheduleConfig');
    const personalRequests = Store.getAllPersonalRequests();
    const restDays = Store.getAllRestDays();

    let result = null;
    let solverUsed = 'unknown';

    if (typeof NightShiftSolver !== 'undefined') {
      solverUsed = 'NightShiftSolver';
      result = await NightShiftSolver.generateNightShiftSchedule({
        staffData,
        scheduleConfig,
        personalRequests,
        restDays,
        options: { algorithm }
      });
    } else if (typeof IncrementalNightShiftSolver !== 'undefined') {
      solverUsed = 'IncrementalNightShiftSolver';
      const configRules = typeof NightShiftConfigRules !== 'undefined'
        ? NightShiftConfigRules.getConfig()
        : null;
      result = await IncrementalNightShiftSolver.solve({
        staffData,
        scheduleConfig,
        personalRequests,
        restDays,
        configRules,
        randomSeed: Date.now()
      });
      issues.push({
        severity: 'P1',
        module: 'M07',
        title: 'NightShiftSolver 未加载，已回退至 IncrementalNightShiftSolver',
        expected: 'NightShiftSolver 可正常加载并可调用',
        actual: 'NightShiftSolver 为 undefined（疑似脚本异常）',
        reproSteps: '打开首页并执行大夜生成',
        evidence: 'window.NightShiftSolver === undefined'
      });
    } else {
      issues.push({
        severity: 'P0',
        module: 'M07',
        title: '夜班求解器不可用',
        expected: '至少有一个夜班求解器可调用',
        actual: 'NightShiftSolver 与 IncrementalNightShiftSolver 均未加载',
        reproSteps: '打开首页并执行大夜生成',
        evidence: 'solver symbols are undefined'
      });
      return {
        algorithm,
        solverUsed: 'none',
        stats: {},
        validation: null,
        issueCount: issues.length,
        issues,
        nightPerDate: {},
        fingerprint: ''
      };
    }

    const dateList = buildDateList(scheduleConfig.startDate, scheduleConfig.endDate);
    const nightPerDate = {};
    dateList.forEach((d) => {
      nightPerDate[d] = 0;
    });

    const staffSchedule = result.schedule || {};
    Object.entries(staffSchedule).forEach(([staffId, dates]) => {
      Object.entries(dates || {}).forEach(([dateStr, shift]) => {
        if (shift === 'NIGHT') {
          nightPerDate[dateStr] = (nightPerDate[dateStr] || 0) + 1;

          const reqType = personalRequests?.[staffId]?.[dateStr];
          if (reqType === 'ANNUAL' || reqType === 'LEGAL' || reqType === 'REQ') {
            issues.push({
              severity: 'P1',
              module: 'M07',
              title: '大夜与休假请求冲突',
              expected: '休假请求日期不应安排NIGHT',
              actual: `员工 ${staffId} 在 ${dateStr} 被排NIGHT，休假类型=${reqType}`,
              reproSteps: '加载基线数据后执行夜班生成',
              evidence: `staffId=${staffId}, date=${dateStr}, reqType=${reqType}`
            });
          }
        }
      });
    });

    Object.entries(nightPerDate).forEach(([dateStr, count]) => {
      if (count < 1 || count > 2) {
        issues.push({
          severity: count < 1 ? 'P0' : 'P1',
          module: 'M07',
          title: '每日大夜人数不满足约束',
          expected: '每日大夜人数应在[1,2]',
          actual: `${dateStr} 实际=${count}`,
          reproSteps: '加载基线数据后执行夜班生成',
          evidence: `date=${dateStr}, nightCount=${count}`
        });
      }
    });

    const validationErrors = result.validation?.errors || [];
    validationErrors.forEach((err) => {
      issues.push({
        severity: 'P1',
        module: 'M07',
        title: '夜班排班验证失败',
        expected: 'validation.errors 为空',
        actual: err,
        reproSteps: '加载基线数据后执行夜班生成',
        evidence: err
      });
    });

    const fingerprint = JSON.stringify(
      Object.entries(staffSchedule)
        .sort(([a], [b]) => String(a).localeCompare(String(b)))
        .map(([staffId, dates]) => [
          staffId,
          Object.entries(dates)
            .filter(([, shift]) => shift === 'NIGHT')
            .map(([d]) => d)
            .sort()
        ])
    );

    return {
      algorithm,
      solverUsed,
      stats: result.stats || {},
      validation: result.validation || null,
      issueCount: issues.length,
      issues,
      nightPerDate,
      fingerprint
    };
  }, { algorithm });
}

async function runNightShiftRounds(page, rounds = 5, options = {}) {
  const all = [];
  for (let i = 0; i < rounds; i += 1) {
    // 同轮次之间保留当前状态，保证测试贴近真实重复生成场景
    // eslint-disable-next-line no-await-in-loop
    const one = await runNightShiftRound(page, options);
    all.push({ round: i + 1, ...one });
  }

  const fingerprints = new Set(all.map((r) => r.fingerprint));
  const totalIssues = all.reduce((acc, item) => acc + item.issueCount, 0);

  return {
    rounds,
    uniqueFingerprints: fingerprints.size,
    totalIssues,
    details: all
  };
}

module.exports = {
  PERIOD,
  LEGAL_REST_DATES,
  SPECIAL_BLOCK_DATES,
  MINIMUM_MANPOWER_PATTERN,
  waitForAppReady,
  setupBaselineState,
  runNightShiftRound,
  runNightShiftRounds,
  writeBugArtifacts
};
