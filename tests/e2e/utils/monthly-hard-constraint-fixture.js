const fs = require('fs');
const path = require('path');
const {
  PERIOD,
  LEGAL_REST_DATES,
  MINIMUM_MANPOWER_PATTERN,
  waitForAppReady,
  writeBugArtifacts
} = require('./scheduler-fixture');

const SCREENSHOT_PERIOD = {
  ...PERIOD,
  name: 'PW-202602-截图排班周期'
};

const SCREENSHOT_VACATION_REQUESTS = {
  '1002': {
    '2026-01-30': 'ANNUAL',
    '2026-02-03': 'LEGAL'
  },
  '1003': {
    '2026-01-29': 'LEGAL',
    '2026-02-05': 'ANNUAL',
    '2026-02-09': 'LEGAL',
    '2026-02-12': 'ANNUAL',
    '2026-02-13': 'ANNUAL',
    '2026-02-14': 'LEGAL',
    '2026-02-16': 'ANNUAL',
    '2026-02-17': 'ANNUAL',
    '2026-02-18': 'ANNUAL',
    '2026-02-19': 'ANNUAL'
  },
  '1004': {
    '2026-02-03': 'LEGAL'
  },
  '1005': {
    '2026-02-03': 'ANNUAL',
    '2026-02-13': 'LEGAL'
  },
  '1008': {
    '2026-02-03': 'ANNUAL'
  },
  '1009': {
    '2026-02-03': 'LEGAL'
  },
  '1011': {
    '2026-02-03': 'ANNUAL'
  },
  '1012': {
    '2026-02-03': 'ANNUAL'
  },
  '1014': {
    '2026-02-18': 'LEGAL'
  },
  '1015': {
    '2026-02-02': 'ANNUAL',
    '2026-02-03': 'ANNUAL',
    '2026-02-16': 'LEGAL'
  },
  '1018': {
    '2026-02-17': 'LEGAL'
  },
  '1019': {
    '2026-02-14': 'LEGAL'
  }
};

const MONTHLY_REPAIR_PROFILES = [
  {
    id: 'R1_STRICT_BASE',
    title: '严格MIP基线',
    minimumAction: null,
    algorithmConfig: {
      algorithmMode: 'mip',
      strictMIP: true,
      maxIterations: 1000,
      backtrackLimit: 100,
      maxExtraDayPerStaff: 1,
      functionBalanceM: 2,
      minConsecutiveWorkDays: 3,
      maxConsecutiveWorkDays: 6,
      minConsecutiveRestDays: 2,
      maxConsecutiveRestDays: 4,
      maxVacationClearSteps: 300
    }
  },
  {
    id: 'R2_STRICT_REINFORCE',
    title: '严格MIP增强',
    minimumAction: null,
    algorithmConfig: {
      algorithmMode: 'mip',
      strictMIP: true,
      maxIterations: 1400,
      backtrackLimit: 180,
      maxExtraDayPerStaff: 2,
      functionBalanceM: 3,
      minConsecutiveWorkDays: 2,
      maxConsecutiveWorkDays: 7,
      minConsecutiveRestDays: 2,
      maxConsecutiveRestDays: 4,
      maxVacationClearSteps: 450
    }
  },
  {
    id: 'R3_FALLBACK_CSP',
    title: '允许回退CSP',
    minimumAction: null,
    algorithmConfig: {
      algorithmMode: 'mip',
      strictMIP: false,
      maxIterations: 1800,
      backtrackLimit: 260,
      maxExtraDayPerStaff: 2,
      functionBalanceM: 4,
      minConsecutiveWorkDays: 2,
      maxConsecutiveWorkDays: 7,
      minConsecutiveRestDays: 1,
      maxConsecutiveRestDays: 4,
      maxVacationClearSteps: 700
    }
  },
  {
    id: 'R4_PLUS1',
    title: '额外上班+1后重跑',
    minimumAction: 'plus1',
    algorithmConfig: {
      algorithmMode: 'mip',
      strictMIP: false,
      maxIterations: 1800,
      backtrackLimit: 260,
      maxExtraDayPerStaff: 2,
      functionBalanceM: 4,
      minConsecutiveWorkDays: 2,
      maxConsecutiveWorkDays: 7,
      minConsecutiveRestDays: 1,
      maxConsecutiveRestDays: 4,
      maxVacationClearSteps: 700
    }
  },
  {
    id: 'R5_PLUS2',
    title: '额外上班+2后重跑',
    minimumAction: 'plus2',
    algorithmConfig: {
      algorithmMode: 'mip',
      strictMIP: false,
      maxIterations: 2200,
      backtrackLimit: 320,
      maxExtraDayPerStaff: 3,
      functionBalanceM: 4,
      minConsecutiveWorkDays: 2,
      maxConsecutiveWorkDays: 8,
      minConsecutiveRestDays: 1,
      maxConsecutiveRestDays: 5,
      maxVacationClearSteps: 900
    }
  }
];

function ensureMonthlyArtifactDir() {
  const dir = path.resolve(process.cwd(), 'artifacts', 'monthly-hard-constraint');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function renderMonthlyRunMarkdown(payload) {
  const lines = [];
  lines.push(`# ${payload.title}`);
  lines.push('');
  lines.push(`- 时间: ${new Date().toISOString()}`);
  lines.push(`- 周期: ${payload.period.startDate} ~ ${payload.period.endDate}`);
  lines.push(`- 人员数: ${payload.baseline.counts.staff}`);
  lines.push(`- 休假配置命中人数: ${payload.baseline.counts.requestedStaff}`);
  lines.push(`- 轮次: ${payload.rounds.length}`);
  lines.push(`- 最终状态: ${payload.success ? '成功' : '失败'}`);
  lines.push('');
  lines.push('## 轮次记录');
  lines.push('');

  payload.rounds.forEach((round, index) => {
    lines.push(`### ${index + 1}. ${round.profile.id} ${round.profile.title}`);
    lines.push('');
    lines.push(`- 最低人力修复: ${round.profile.minimumAction || '无'}`);
    lines.push(`- 求解模式: 请求=${round.solver.requestedMode || '-'} / 实际=${round.solver.usedMode || '-'}`);
    lines.push(`- strictMIP: ${round.solver.strictMIP === true ? 'ON' : 'OFF'}`);
    lines.push(`- 硬约束: total=${round.hard.total}, dailyShortage=${round.hard.dailyShortage}, targetMismatch=${round.hard.targetMismatch}`);
    lines.push(`- 额外上班计划: ${round.minimumRepair.summary}`);
    lines.push(`- 结果: ${round.success ? '通过' : '未通过'}`);
    if (round.solver.fallbackReason) {
      lines.push(`- 回退说明: ${round.solver.fallbackReason}`);
    }
    lines.push('');
  });

  if (payload.finalSnapshot) {
    lines.push('## 最终快照');
    lines.push('');
    lines.push(`- 激活本月排班配置: ${payload.finalSnapshot.active.monthlyScheduleConfigId || '-'}`);
    lines.push(`- 额外上班人数: ${payload.finalSnapshot.minimumManpower.extraPlanStaffCount}`);
    lines.push(`- 额外上班总天数: ${payload.finalSnapshot.minimumManpower.extraPlanDays}`);
    lines.push(`- 月班别分布: ${JSON.stringify(payload.finalSnapshot.monthlySchedule.shiftDistribution)}`);
    lines.push('');
  }

  return lines.join('\n');
}

function writeMonthlyArtifacts(name, payload) {
  const dir = ensureMonthlyArtifactDir();
  const jsonPath = path.join(dir, `${name}.json`);
  const mdPath = path.join(dir, `${name}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(mdPath, renderMonthlyRunMarkdown(payload), 'utf8');
  return { jsonPath, mdPath };
}

async function waitForMonthlyScheduleReady(page) {
  await waitForAppReady(page);
  await page.waitForFunction(() => {
    return typeof MonthlyScheduleConfigManager !== 'undefined'
      && typeof MIPDayShiftSolver !== 'undefined'
      && typeof CSPSolver !== 'undefined'
      && typeof MinimumManpowerManager !== 'undefined';
  }, null, { timeout: 90000 });
}

async function suppressBlockingDialogs(page) {
  await page.evaluate(() => {
    window.__pwDialogLog = [];
    window.alert = (msg) => {
      window.__pwDialogLog.push({ type: 'alert', message: String(msg || '') });
    };
    window.confirm = (msg) => {
      window.__pwDialogLog.push({ type: 'confirm', message: String(msg || '') });
      return true;
    };
    window.prompt = (msg, value) => {
      window.__pwDialogLog.push({ type: 'prompt', message: String(msg || ''), value: value == null ? '' : String(value) });
      return value == null ? '' : String(value);
    };
  });
}

async function setupMonthlyScheduleScenario(page) {
  return page.evaluate(async ({ period, legalRestDates, minimumPattern, requestTemplate }) => {
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

    if (!Store || !DB || !DataLoader || !MonthlyScheduleConfigManager) {
      throw new Error('月度班次配置依赖模块未就绪');
    }

    const restDays = {};
    legalRestDates.forEach((d) => {
      restDays[d] = true;
    });

    const scenarioScopeRaw = String((period && period.cityScope) || 'SH').trim().toUpperCase();
    const scenarioCityScope = (scenarioScopeRaw === 'CD' || scenarioScopeRaw === 'ALL') ? scenarioScopeRaw : 'SH';

    const periodConfigId = Store.createSchedulePeriodConfig(
      period.name,
      {
        startDate: period.startDate,
        endDate: period.endDate,
        year: period.year,
        month: period.month
      },
      restDays,
      scenarioCityScope
    );
    await Store.setActiveSchedulePeriodConfig(periodConfigId);

    const staffResp = await fetch('./人员配置 - sh.xlsx');
    if (!staffResp.ok) {
      throw new Error(`fetch 人员配置文件失败: ${staffResp.status}`);
    }

    const staffBlob = await staffResp.blob();
    const staffFile = new File([staffBlob], '人员配置 - sh.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const parsedStaff = await DataLoader.loadExcelFile(staffFile);
    const enrichedStaff = parsedStaff.map((staff) => ({
      ...staff,
      annualLeaveDays: 10,
      sickLeaveDays: 0
    }));

    Store.batchAddStaffData(enrichedStaff);
    const staffConfigId = Store.createStaffConfig('PW-202602-人员配置-sh', scenarioCityScope);
    await Store.setActiveConfig(staffConfigId);

    const currentStaff = Store.getCurrentStaffData();
    const staffIds = currentStaff.map((staff) => String(staff.id || staff.staffId)).sort();
    const requests = {};
    staffIds.forEach((id) => {
      requests[id] = {};
    });

    Object.keys(requestTemplate || {}).forEach((staffId) => {
      const sid = String(staffId);
      if (!requests[sid]) return;
      Object.assign(requests[sid], requestTemplate[staffId]);
    });

    const requestConfigId = Store.createRequestConfig('PW-202602-个性化休假-截图', requests, restDays, scenarioCityScope);
    Store.updateRequestConfig(requestConfigId, {
      schedulePeriod: `${period.startDate} 至 ${period.endDate}`,
      scheduleConfig: {
        startDate: period.startDate,
        endDate: period.endDate,
        year: period.year,
        month: period.month
      }
    });
    await Store.setActiveRequestConfig(requestConfigId);

    const dateList = buildDateList(period.startDate, period.endDate);
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
      dailyDemand,
      extraWorkPlan: {
        enabled: false,
        mode: 'staffSpecific',
        staffExtraDays: {},
        stage: 'none'
      }
    };
    Store.updateState({ minimumManpowerConfig }, true);

    await MonthlyScheduleConfigManager.createNewConfig();
    const monthlyScheduleConfigId = Store.getActiveMonthlyScheduleConfigId
      ? Store.getActiveMonthlyScheduleConfigId()
      : Store.state.activeMonthlyScheduleConfigId;
    const monthlyConfig = Store.getMonthlyScheduleConfig(monthlyScheduleConfigId);
    if (!monthlyConfig) {
      throw new Error('本月排班配置创建失败');
    }

    monthlyConfig.algorithmConfig = {
      ...MonthlyScheduleConfigManager.getDefaultAlgorithmConfig()
    };
    await DB.saveMonthlyScheduleConfig(monthlyConfig);
    await Store.saveState(false);

    const requestStats = staffIds.map((id) => {
      const row = requests[id] || {};
      const annual = Object.values(row).filter((v) => v === 'ANNUAL').length;
      const legal = Object.values(row).filter((v) => v === 'LEGAL').length;
      const req = Object.values(row).filter((v) => v === 'REQ').length;
      return { id, annual, legal, req, total: annual + legal + req };
    });

    return {
      active: {
        schedulePeriodConfigId: Store.getState('activeSchedulePeriodConfigId'),
        staffConfigId: Store.getState('activeConfigId'),
        requestConfigId: Store.getState('activeRequestConfigId'),
        monthlyScheduleConfigId
      },
      counts: {
        staff: staffIds.length,
        legalRestDays: Object.keys(restDays).length,
        minimumManpowerDays: Object.keys(dailyDemand).length,
        requestedStaff: requestStats.filter((item) => item.total > 0).length,
        annualRequests: requestStats.reduce((sum, item) => sum + item.annual, 0),
        legalRequests: requestStats.reduce((sum, item) => sum + item.legal, 0)
      },
      requestStats
    };
  }, {
    period: SCREENSHOT_PERIOD,
    legalRestDates: LEGAL_REST_DATES,
    minimumPattern: MINIMUM_MANPOWER_PATTERN,
    requestTemplate: SCREENSHOT_VACATION_REQUESTS
  });
}

async function applyMinimumRepairAction(page, action) {
  if (!action) {
    return {
      action: null,
      applied: false,
      summary: '无',
      beforeGap: null,
      afterGap: null
    };
  }

  return page.evaluate(({ action }) => {
    if (!MinimumManpowerManager || !Store) {
      throw new Error('MinimumManpowerManager 未就绪');
    }

    const scheduleConfig = Store.getState('scheduleConfig') || {};
    if (!scheduleConfig.startDate || !scheduleConfig.endDate) {
      throw new Error('排班周期未设置，无法应用最低人力修复');
    }

    const dateList = typeof MinimumManpowerManager.getDateList === 'function'
      ? MinimumManpowerManager.getDateList(scheduleConfig.startDate, scheduleConfig.endDate)
      : [];
    const config = typeof MinimumManpowerManager.cloneConfig === 'function'
      ? MinimumManpowerManager.cloneConfig(Store.getState('minimumManpowerConfig') || {})
      : JSON.parse(JSON.stringify(Store.getState('minimumManpowerConfig') || {}));

    if (!config || !config.dailyDemand) {
      return {
        action,
        applied: false,
        summary: 'minimumManpowerConfig 缺失',
        beforeGap: null,
        afterGap: null
      };
    }

    if (typeof MinimumManpowerManager.restoreDemandFromCompensationBase === 'function') {
      MinimumManpowerManager.restoreDemandFromCompensationBase(config);
    }
    if (typeof MinimumManpowerManager.clearCompensationPlan === 'function') {
      MinimumManpowerManager.clearCompensationPlan(config);
    }

    const before = typeof MinimumManpowerManager.buildManpowerGapAnalysis === 'function'
      ? MinimumManpowerManager.buildManpowerGapAnalysis(config, dateList)
      : { lowerBoundGap: null };

    let result = null;
    if (action === 'plus1') {
      result = MinimumManpowerManager.applyExtraWorkPlusOne(config, dateList);
    } else if (action === 'plus2') {
      result = MinimumManpowerManager.applyExtraWorkPlusTwo(config, dateList);
    }

    if (typeof MinimumManpowerManager.persistConfig === 'function') {
      MinimumManpowerManager.persistConfig(config, true);
    } else {
      Store.updateState({ minimumManpowerConfig: config }, true);
    }

    const after = typeof MinimumManpowerManager.buildManpowerGapAnalysis === 'function'
      ? MinimumManpowerManager.buildManpowerGapAnalysis(config, dateList)
      : { lowerBoundGap: null };
    const extraPlan = config.extraWorkPlan || { enabled: false, staffExtraDays: {} };
    const extraPlanDays = Object.values(extraPlan.staffExtraDays || {}).reduce((sum, days) => {
      const n = Number(days);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);

    let summary = '无变化';
    let applied = false;
    if (action === 'plus1' && result && Number(result.applied || 0) > 0) {
      applied = true;
      summary = `+1 人数=${Number(result.applied || 0)}`;
    } else if (action === 'plus2' && result) {
      const changed = Number(result.appliedStage1 || 0) + Number(result.appliedStage2 || 0);
      if (changed > 0) {
        applied = true;
        summary = `先+1=${Number(result.appliedStage1 || 0)}，再+2=${Number(result.appliedStage2 || 0)}`;
      }
    }

    return {
      action,
      applied,
      summary,
      beforeGap: before.lowerBoundGap,
      afterGap: after.lowerBoundGap,
      extraPlanEnabled: extraPlan.enabled === true,
      extraPlanStaffCount: Object.keys(extraPlan.staffExtraDays || {}).length,
      extraPlanDays
    };
  }, { action });
}

async function runMonthlyScheduleRound(page, profile) {
  return page.evaluate(async ({ profile }) => {
    if (!MonthlyScheduleConfigManager || !Store || !DB) {
      throw new Error('MonthlyScheduleConfigManager 未就绪');
    }

    const configId = Store.getActiveMonthlyScheduleConfigId
      ? Store.getActiveMonthlyScheduleConfigId()
      : Store.state.activeMonthlyScheduleConfigId;
    const config = Store.getMonthlyScheduleConfig(configId);
    if (!config) {
      throw new Error('当前无激活的本月排班配置');
    }

    config.algorithmConfig = {
      ...MonthlyScheduleConfigManager.getDefaultAlgorithmConfig(),
      ...(profile.algorithmConfig || {})
    };
    config.updatedAt = new Date().toISOString();

    await DB.saveMonthlyScheduleConfig(config);
    await Store.saveState(false);
    await MonthlyScheduleConfigManager.generateMonthlyScheduleConfig();
    const waitDeadline = Date.now() + 360000;
    while (true) {
      const jobs = Store.getState('monthlyScheduleGenerationJobs') || {};
      const job = jobs[configId];
      const status = job && typeof job.status === 'string' ? job.status : '';
      if (status === 'completed') {
        break;
      }
      if (status === 'failed') {
        throw new Error(`月度班次后台任务失败: ${job.message || job.summary || 'unknown'}`);
      }
      if (Date.now() > waitDeadline) {
        throw new Error('等待月度班次后台任务完成超时');
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const nextConfig = Store.getMonthlyScheduleConfig(configId);
    const report = nextConfig && nextConfig.dayShiftReport ? nextConfig.dayShiftReport : {};
    const stats = report.stats || {};
    const hard = stats.hardViolations || {};
    const meta = report.meta || {};
    const solver = meta.solver || {};
    const minimumMeta = meta.minimumManpower || {};
    const extraWorkPlan = (Store.getState('minimumManpowerConfig') || {}).extraWorkPlan || {};
    const dialogLog = Array.isArray(window.__pwDialogLog) ? window.__pwDialogLog.slice(-6) : [];

    return {
      configId,
      hard: {
        total: Number(hard.total || 0),
        dailyShortage: Number(hard.dailyShortage || 0),
        targetMismatch: Number(hard.targetMismatch || 0),
        shortageByDate: hard.shortageByDate || {}
      },
      solver: {
        requestedMode: solver.requestedMode || '',
        usedMode: solver.usedMode || '',
        strictMIP: solver.strictMIP === true,
        fallbackReason: solver.fallbackReason || '',
        shiftShortageRebalance: minimumMeta.shiftShortageRebalance || null,
        specialRestRebalance: minimumMeta.specialRestRebalance || null
      },
      warnings: Array.isArray(stats.warnings) ? stats.warnings.slice(0, 20) : [],
      errors: Array.isArray(stats.errors) ? stats.errors.slice(0, 20) : [],
      shiftDistribution: stats.shiftDistribution || {},
      monthlyShiftAssignments: stats.monthlyShiftAssignments || {},
      extraWorkPlan: {
        enabled: extraWorkPlan.enabled === true,
        staffExtraDays: extraWorkPlan.staffExtraDays || {},
        stage: extraWorkPlan.stage || ''
      },
      dialogLog,
      success: Number(hard.total || 0) <= 0 && Number(hard.dailyShortage || 0) <= 0
    };
  }, { profile });
}

async function captureMonthlyScheduleSnapshot(page) {
  return page.evaluate(() => {
    const state = Store.getState() || {};
    const configId = state.activeMonthlyScheduleConfigId || null;
    const config = configId && Store.getMonthlyScheduleConfig
      ? Store.getMonthlyScheduleConfig(configId)
      : null;
    const report = config && config.dayShiftReport ? config.dayShiftReport : {};
    const stats = report.stats || {};
    const minimumConfig = state.minimumManpowerConfig || {};
    const extraWorkPlan = minimumConfig.extraWorkPlan || {};
    const extraPlanDays = Object.values(extraWorkPlan.staffExtraDays || {}).reduce((sum, days) => {
      const n = Number(days);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);

    return {
      active: {
        schedulePeriodConfigId: state.activeSchedulePeriodConfigId || null,
        staffConfigId: state.activeConfigId || null,
        requestConfigId: state.activeRequestConfigId || null,
        monthlyScheduleConfigId: state.activeMonthlyScheduleConfigId || null
      },
      minimumManpower: {
        periodKey: minimumConfig.periodKey || null,
        extraPlanEnabled: extraWorkPlan.enabled === true,
        extraPlanStaffCount: Object.keys(extraWorkPlan.staffExtraDays || {}).length,
        extraPlanDays,
        extraPlanStage: extraWorkPlan.stage || ''
      },
      monthlySchedule: {
        name: config ? config.name : null,
        hardViolations: stats.hardViolations || {},
        shiftDistribution: stats.shiftDistribution || {},
        warningCount: Array.isArray(stats.warnings) ? stats.warnings.length : 0,
        errorCount: Array.isArray(stats.errors) ? stats.errors.length : 0
      }
    };
  });
}

async function runMonthlyScheduleSelfRepair(page, options = {}) {
  const profiles = Array.isArray(options.profiles) && options.profiles.length > 0
    ? options.profiles
    : MONTHLY_REPAIR_PROFILES;

  const rounds = [];
  let finalSnapshot = null;

  for (let i = 0; i < profiles.length; i += 1) {
    const profile = profiles[i];
    // eslint-disable-next-line no-await-in-loop
    const minimumRepair = await applyMinimumRepairAction(page, profile.minimumAction || null);
    // eslint-disable-next-line no-await-in-loop
    const solverRound = await runMonthlyScheduleRound(page, profile);
    const round = {
      profile,
      minimumRepair,
      ...solverRound
    };
    rounds.push(round);
    if (round.success) {
      break;
    }
  }

  finalSnapshot = await captureMonthlyScheduleSnapshot(page);

  return {
    success: rounds.some((item) => item.success),
    rounds,
    finalSnapshot
  };
}

module.exports = {
  SCREENSHOT_PERIOD,
  SCREENSHOT_VACATION_REQUESTS,
  MONTHLY_REPAIR_PROFILES,
  waitForMonthlyScheduleReady,
  suppressBlockingDialogs,
  setupMonthlyScheduleScenario,
  runMonthlyScheduleSelfRepair,
  captureMonthlyScheduleSnapshot,
  writeMonthlyArtifacts,
  writeBugArtifacts
};
