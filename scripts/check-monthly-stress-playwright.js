#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const {
  waitForMonthlyScheduleReady,
  suppressBlockingDialogs
} = require('../tests/e2e/utils/monthly-hard-constraint-fixture');

const ROOT = process.cwd();
const PORT = Number(process.env.MONTHLY_STRESS_PORT || 8000);
const BASE_URL = `http://127.0.0.1:${PORT}/index.html`;
const OUT_DIR = path.join(ROOT, 'artifacts', 'monthly-hard-constraint');
const SKIP_GENERATE = process.env.MONTHLY_STRESS_SKIP_GENERATE === '1';
const STRESS_MODE = String(process.env.MONTHLY_STRESS_MODE || 'mip').toLowerCase() === 'csp' ? 'csp' : 'mip';
const STRESS_STRICT_MIP = process.env.MONTHLY_STRESS_STRICT_MIP !== '0';

const PERIOD = {
  startDate: '2026-01-26',
  endDate: '2026-02-25',
  year: 2026,
  month: 2,
  name: 'PW-202602-高压力复现'
};

// 来自现网“高压力”口径：B2 高需求 + A 低谷日波动
const DEMAND = {
  A1: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2],
  A: [2, 2, 2, 2, 1, 2, 1, 2, 2, 2, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 1, 1, 1, 1, 2, 1, 2, 2, 1, 2, 1],
  A2: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  B1: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  B2: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3]
};

// 固定夜班与个休（与原校验脚本同源）
const FIXED = [
  [1002, 'ANNUAL', '2026-02-10', '2026-02-10'], [1002, 'LEGAL', '2026-02-04', '2026-02-04'], [1002, 'NIGHT', '2026-02-11', '2026-02-14'], [1002, 'REST', '2026-02-15', '2026-02-16'],
  [1003, 'LEGAL', '2026-01-30', '2026-01-30'], [1003, 'NIGHT', '2026-01-31', '2026-02-02'], [1003, 'REST', '2026-02-03', '2026-02-04'], [1003, 'LEGAL', '2026-02-08', '2026-02-08'], [1003, 'ANNUAL', '2026-02-14', '2026-02-19'],
  [1004, 'LEGAL', '2026-02-01', '2026-02-01'], [1004, 'NIGHT', '2026-02-02', '2026-02-05'], [1004, 'REST', '2026-02-06', '2026-02-07'],
  [1005, 'LEGAL', '2026-02-01', '2026-02-01'], [1005, 'LEGAL', '2026-02-13', '2026-02-13'], [1005, 'NIGHT', '2026-02-19', '2026-02-22'], [1005, 'REST', '2026-02-23', '2026-02-24'],
  [1006, 'LEGAL', '2026-02-01', '2026-02-01'], [1006, 'NIGHT', '2026-02-23', '2026-02-25'],
  [1007, 'NIGHT', '2026-01-26', '2026-01-28'], [1007, 'REST', '2026-01-29', '2026-01-30'], [1007, 'LEGAL', '2026-02-01', '2026-02-01'],
  [1008, 'LEGAL', '2026-02-01', '2026-02-01'], [1008, 'NIGHT', '2026-02-05', '2026-02-08'], [1008, 'REST', '2026-02-09', '2026-02-10'],
  [1009, 'LEGAL', '2026-02-01', '2026-02-01'], [1009, 'NIGHT', '2026-02-15', '2026-02-18'], [1009, 'REST', '2026-02-19', '2026-02-20'],
  [1010, 'ANNUAL', '2026-01-28', '2026-01-28'], [1010, 'LEGAL', '2026-02-01', '2026-02-01'], [1010, 'NIGHT', '2026-02-19', '2026-02-22'], [1010, 'REST', '2026-02-23', '2026-02-24'],
  [1011, 'NIGHT', '2026-01-26', '2026-01-28'], [1011, 'REST', '2026-01-29', '2026-01-30'], [1011, 'LEGAL', '2026-02-01', '2026-02-01'], [1011, 'LEGAL', '2026-02-09', '2026-02-09'],
  [1012, 'LEGAL', '2026-02-01', '2026-02-01'], [1012, 'NIGHT', '2026-02-08', '2026-02-11'], [1012, 'REST', '2026-02-12', '2026-02-13'],
  [1013, 'ANNUAL', '2026-01-30', '2026-01-30'], [1013, 'LEGAL', '2026-02-01', '2026-02-01'], [1013, 'NIGHT', '2026-02-12', '2026-02-14'], [1013, 'REST', '2026-02-15', '2026-02-16'],
  [1014, 'NIGHT', '2026-01-29', '2026-01-31'], [1014, 'REST', '2026-02-01', '2026-02-02'], [1014, 'ANNUAL', '2026-02-15', '2026-02-15'], [1014, 'LEGAL', '2026-02-16', '2026-02-16'],
  [1015, 'LEGAL', '2026-02-01', '2026-02-01'], [1015, 'LEGAL', '2026-02-16', '2026-02-16'],
  [1016, 'NIGHT', '2026-02-23', '2026-02-25'],
  [1017, 'ANNUAL', '2026-02-13', '2026-02-13'], [1017, 'NIGHT', '2026-02-18', '2026-02-20'], [1017, 'REST', '2026-02-21', '2026-02-22'],
  [1018, 'NIGHT', '2026-02-14', '2026-02-17'], [1018, 'REST', '2026-02-18', '2026-02-19'], [1018, 'LEGAL', '2026-02-25', '2026-02-25'],
  [1019, 'NIGHT', '2026-02-05', '2026-02-07'], [1019, 'REST', '2026-02-08', '2026-02-09'], [1019, 'ANNUAL', '2026-02-13', '2026-02-13'], [1019, 'LEGAL', '2026-02-24', '2026-02-24']
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function waitServerReady(url, timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
          return;
        }
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`server not ready: status=${res.statusCode}`));
          return;
        }
        setTimeout(tryOnce, 250);
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error('server not reachable'));
          return;
        }
        setTimeout(tryOnce, 250);
      });
    };
    tryOnce();
  });
}

function startServer() {
  return spawn('python3', ['-m', 'http.server', String(PORT)], {
    cwd: ROOT,
    stdio: 'ignore'
  });
}

(async () => {
  ensureDir(OUT_DIR);
  const outPath = path.join(OUT_DIR, `stress-monthly-result-${stamp()}.json`);
  const server = startServer();
  let browser;

  try {
    await waitServerReady(BASE_URL);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(BASE_URL);
    await waitForMonthlyScheduleReady(page);
    await suppressBlockingDialogs(page);

    const result = await page.evaluate(async ({ period, fixedRows, demand, skipGenerate, stressMode, strictMIP }) => {
      function buildDateList(startDate, endDate) {
        const list = [];
        const c = new Date(startDate);
        const e = new Date(endDate);
        while (c <= e) {
          const y = c.getFullYear();
          const m = String(c.getMonth() + 1).padStart(2, '0');
          const d = String(c.getDate()).padStart(2, '0');
          list.push(`${y}-${m}-${d}`);
          c.setDate(c.getDate() + 1);
        }
        return list;
      }
      function dateRange(start, end) {
        const list = [];
        const c = new Date(start);
        const e = new Date(end);
        while (c <= e) {
          const y = c.getFullYear();
          const m = String(c.getMonth() + 1).padStart(2, '0');
          const d = String(c.getDate()).padStart(2, '0');
          list.push(`${y}-${m}-${d}`);
          c.setDate(c.getDate() + 1);
        }
        return list;
      }

      const dates = buildDateList(period.startDate, period.endDate);
      const restDays = {};
      dates.forEach((d) => {
        const wd = new Date(d).getDay();
        if (wd === 0 || wd === 6) restDays[d] = true;
      });

      const periodConfigId = Store.createSchedulePeriodConfig(period.name, {
        startDate: period.startDate,
        endDate: period.endDate,
        year: period.year,
        month: period.month
      }, restDays);
      await Store.setActiveSchedulePeriodConfig(periodConfigId);

      const staffResp = await fetch('./人员配置 - sh.xlsx');
      if (!staffResp.ok) throw new Error(`fetch 人员配置失败: ${staffResp.status}`);
      const staffBlob = await staffResp.blob();
      const staffFile = new File([staffBlob], '人员配置 - sh.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const parsedStaff = await DataLoader.loadExcelFile(staffFile);
      const enriched = parsedStaff.map((s) => ({ ...s, annualLeaveDays: 12, sickLeaveDays: 0 }));
      Store.batchAddStaffData(enriched);
      const staffConfigId = Store.createStaffConfig(`PW-STRESS-${Date.now()}`);
      await Store.setActiveConfig(staffConfigId);

      const requests = {};
      const nightSchedule = {};
      (Store.getCurrentStaffData() || []).forEach((s) => {
        const sid = String(s.id || s.staffId);
        requests[sid] = {};
        nightSchedule[sid] = {};
      });

      fixedRows.forEach(([id, type, start, end]) => {
        const sid = String(id);
        dateRange(start, end).forEach((d) => {
          if (!dates.includes(d)) return;
          if (!requests[sid]) requests[sid] = {};
          if (!nightSchedule[sid]) nightSchedule[sid] = {};
          if (type === 'NIGHT') nightSchedule[sid][d] = 'NIGHT';
          if (type === 'REST') nightSchedule[sid][d] = 'REST';
          if (type === 'ANNUAL' || type === 'LEGAL' || type === 'REQ' || type === 'SICK') {
            requests[sid][d] = type;
          }
        });
      });

      const requestConfigId = Store.createRequestConfig(`PW-STRESS-REQ-${Date.now()}`, requests, restDays);
      await Store.setActiveRequestConfig(requestConfigId);

      const dailyDemand = {};
      dates.forEach((d, idx) => {
        dailyDemand[d] = {
          A1: Number(demand.A1[idx] || 0),
          A: Number(demand.A[idx] || 0),
          A2: Number(demand.A2[idx] || 0),
          B1: Number(demand.B1[idx] || 0),
          B2: Number(demand.B2[idx] || 0)
        };
      });

      const minimumManpowerConfig = {
        periodKey: `${period.startDate}_${period.endDate}`,
        weekdayTemplate: { A1: 2, A: 2, A2: 1, B1: 2, B2: 3 },
        specialTemplate: { A1: 1, A: 1, A2: 1, B1: 2, B2: 2 },
        dailyDemand,
        extraWorkPlan: { enabled: false, mode: 'staffSpecific', staffExtraDays: {}, stage: 'none' }
      };
      Store.updateState({ minimumManpowerConfig }, true);

      if (typeof NightShiftManager !== 'undefined') {
        NightShiftManager.currentSchedule = nightSchedule;
      }

      if (skipGenerate) {
        const dateObjs = (typeof MinimumManpowerManager !== 'undefined' && typeof MinimumManpowerManager.getDateList === 'function')
          ? MinimumManpowerManager.getDateList(period.startDate, period.endDate)
          : dates.map((d) => ({ dateStr: d }));
        const mmConfig = (typeof MinimumManpowerManager !== 'undefined' && typeof MinimumManpowerManager.cloneConfig === 'function')
          ? MinimumManpowerManager.cloneConfig(Store.getState('minimumManpowerConfig') || {})
          : JSON.parse(JSON.stringify(Store.getState('minimumManpowerConfig') || {}));
        const before = (typeof MinimumManpowerManager !== 'undefined' && typeof MinimumManpowerManager.buildManpowerGapAnalysis === 'function')
          ? MinimumManpowerManager.buildManpowerGapAnalysis(mmConfig, dateObjs)
          : null;
        let plus1 = null;
        let plus2 = null;
        let merge = null;
        let after = before;
        if (before && before.lowerBoundGap > 0 && typeof MinimumManpowerManager.applyExtraWorkPlusOne === 'function') {
          plus1 = MinimumManpowerManager.applyExtraWorkPlusOne(mmConfig, dateObjs);
          after = MinimumManpowerManager.buildManpowerGapAnalysis(mmConfig, dateObjs);
        }
        if (after && after.lowerBoundGap > 0 && typeof MinimumManpowerManager.applyExtraWorkPlusTwo === 'function') {
          plus2 = MinimumManpowerManager.applyExtraWorkPlusTwo(mmConfig, dateObjs);
          after = MinimumManpowerManager.buildManpowerGapAnalysis(mmConfig, dateObjs);
        }
        if (after && after.lowerBoundGap > 0 && typeof MinimumManpowerManager.applyMergeReliefPlan === 'function') {
          const rounds = [];
          let round = 0;
          while (after && after.lowerBoundGap > 0 && round < 8) {
            const before = Number(after.lowerBoundGap || 0);
            const step = MinimumManpowerManager.applyMergeReliefPlan(mmConfig, dateObjs, after);
            const applied = Number(step && step.applied || 0);
            if (applied <= 0) break;
            after = MinimumManpowerManager.buildManpowerGapAnalysis(mmConfig, dateObjs);
            const next = Number(after.lowerBoundGap || 0);
            rounds.push({ round: round + 1, applied, before, after: next });
            round += 1;
            if (next >= before) break;
          }
          merge = { rounds };
        }
        return {
          skipGenerate: true,
          beforeGap: before ? {
            lowerBoundGap: Number(before.lowerBoundGap || 0),
            capacityGap: Number(before.capacityGap || 0),
            structuralGapSum: Number(before.structuralGapSum || 0),
            totalDemand: Number(before.totalDemand || 0),
            baseWhiteCapacity: Number(before.baseWhiteCapacity || 0),
            maxWhiteCapacity: Number(before.maxWhiteCapacity || 0)
          } : null,
          plus1,
          plus2,
          merge,
          afterGap: after ? {
            lowerBoundGap: Number(after.lowerBoundGap || 0),
            capacityGap: Number(after.capacityGap || 0),
            structuralGapSum: Number(after.structuralGapSum || 0),
            maxWhiteCapacity: Number(after.maxWhiteCapacity || 0)
          } : null
        };
      }

      await MonthlyScheduleConfigManager.createNewConfig();
      const cfgId = Store.getState('activeMonthlyScheduleConfigId');
      const cfg = Store.getMonthlyScheduleConfig(cfgId);
      if (cfg) {
        cfg.algorithmConfig = {
          ...(MonthlyScheduleConfigManager.getDefaultAlgorithmConfig
            ? MonthlyScheduleConfigManager.getDefaultAlgorithmConfig()
            : (cfg.algorithmConfig || {})),
          algorithmMode: stressMode,
          strictMIP: strictMIP,
          maxIterations: 600,
          backtrackLimit: 80,
          maxExtraDayPerStaff: 2
        };
        await DB.saveMonthlyScheduleConfig(cfg);
        await Store.saveState(false);
      }
      await MonthlyScheduleConfigManager.generateMonthlyScheduleConfig();

      const configId = Store.getState('activeMonthlyScheduleConfigId');
      const doneCfg = Store.getMonthlyScheduleConfig(configId);
      const report = doneCfg && doneCfg.dayShiftReport ? doneCfg.dayShiftReport : {};
      const stats = report.stats || {};
      const hard = stats.hardViolations || {};
      const minimumMeta = (report.meta && report.meta.minimumManpower) ? report.meta.minimumManpower : {};
      return {
        configId,
        hard: {
          total: Number(hard.total || 0),
          dailyShortage: Number(hard.dailyShortage || 0),
          targetMismatch: Number(hard.targetMismatch || 0),
          maxWorkViolation: Number(hard.maxWorkViolation || 0),
          maxRestViolation: Number(hard.maxRestViolation || 0)
        },
        soft: {
          softPenalty: Number(stats.softPenalty || 0),
          warningCount: Array.isArray(stats.warnings) ? stats.warnings.length : 0,
          errorCount: Array.isArray(stats.errors) ? stats.errors.length : 0,
          warningSample: Array.isArray(stats.warnings) ? stats.warnings.slice(0, 15) : []
        },
        solver: (report.meta && report.meta.solver) ? report.meta.solver : {},
        minimumAutoRepair: minimumMeta.autoRepair || null,
        extraWorkPlan: minimumMeta.extraWorkPlan || null
      };
    }, {
      period: PERIOD,
      fixedRows: FIXED,
      demand: DEMAND,
      skipGenerate: SKIP_GENERATE,
      stressMode: STRESS_MODE,
      strictMIP: STRESS_STRICT_MIP
    });

    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify({ outPath, result }, null, 2));
  } catch (error) {
    console.error('check-monthly-stress failed:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server && !server.killed) server.kill('SIGTERM');
  }
})();
