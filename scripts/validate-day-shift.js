#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.cwd();
const ART_DIR = path.join(ROOT, 'artifacts', 'day-shift-validation');
const PORT = 8000;
const BASE_URL = `http://127.0.0.1:${PORT}/index.html`;
const ROUNDS = Number(process.env.DAY_SHIFT_VALIDATE_ROUNDS || 5);

const STAFF = [
  [1001, '上海员工_01', 17, 100], [1002, '上海员工_02', 13, 80], [1003, '上海员工_03', 12, 70], [1004, '上海员工_04', 14, 90], [1005, '上海员工_05', 13, 85],
  [1006, '上海员工_06', 13, 88], [1007, '上海员工_07', 14, 92], [1008, '上海员工_08', 13, 80], [1009, '上海员工_09', 14, 75], [1010, '上海员工_10', 14, 95],
  [1011, '上海员工_11', 14, 70], [1012, '上海员工_12', 13, 80], [1013, '上海员工_13', 14, 85], [1014, '上海员工_14', 13, 80], [1015, '上海员工_15', 16, 99],
  [1016, '上海员工_16', 13, 80], [1017, '上海员工_17', 14, 85], [1018, '上海员工_18', 13, 80], [1019, '上海员工_19', 14, 88]
];

const FIXED = [
  [1002,'ANNUAL','2026-02-10','2026-02-10'],[1002,'LEGAL','2026-02-04','2026-02-04'],[1002,'NIGHT','2026-02-11','2026-02-14'],[1002,'REST','2026-02-15','2026-02-16'],
  [1003,'LEGAL','2026-01-30','2026-01-30'],[1003,'NIGHT','2026-01-31','2026-02-02'],[1003,'REST','2026-02-03','2026-02-04'],[1003,'LEGAL','2026-02-08','2026-02-08'],[1003,'ANNUAL','2026-02-14','2026-02-19'],
  [1004,'LEGAL','2026-02-01','2026-02-01'],[1004,'NIGHT','2026-02-02','2026-02-05'],[1004,'REST','2026-02-06','2026-02-07'],
  [1005,'LEGAL','2026-02-01','2026-02-01'],[1005,'LEGAL','2026-02-13','2026-02-13'],[1005,'NIGHT','2026-02-19','2026-02-22'],[1005,'REST','2026-02-23','2026-02-24'],
  [1006,'LEGAL','2026-02-01','2026-02-01'],[1006,'NIGHT','2026-02-23','2026-02-25'],
  [1007,'NIGHT','2026-01-26','2026-01-28'],[1007,'REST','2026-01-29','2026-01-30'],[1007,'LEGAL','2026-02-01','2026-02-01'],
  [1008,'LEGAL','2026-02-01','2026-02-01'],[1008,'NIGHT','2026-02-05','2026-02-08'],[1008,'REST','2026-02-09','2026-02-10'],
  [1009,'LEGAL','2026-02-01','2026-02-01'],[1009,'NIGHT','2026-02-15','2026-02-18'],[1009,'REST','2026-02-19','2026-02-20'],
  [1010,'ANNUAL','2026-01-28','2026-01-28'],[1010,'LEGAL','2026-02-01','2026-02-01'],[1010,'NIGHT','2026-02-19','2026-02-22'],[1010,'REST','2026-02-23','2026-02-24'],
  [1011,'NIGHT','2026-01-26','2026-01-28'],[1011,'REST','2026-01-29','2026-01-30'],[1011,'LEGAL','2026-02-01','2026-02-01'],[1011,'LEGAL','2026-02-09','2026-02-09'],
  [1012,'LEGAL','2026-02-01','2026-02-01'],[1012,'NIGHT','2026-02-08','2026-02-11'],[1012,'REST','2026-02-12','2026-02-13'],
  [1013,'ANNUAL','2026-01-30','2026-01-30'],[1013,'LEGAL','2026-02-01','2026-02-01'],[1013,'NIGHT','2026-02-12','2026-02-14'],[1013,'REST','2026-02-15','2026-02-16'],
  [1014,'NIGHT','2026-01-29','2026-01-31'],[1014,'REST','2026-02-01','2026-02-02'],[1014,'ANNUAL','2026-02-15','2026-02-15'],[1014,'LEGAL','2026-02-16','2026-02-16'],
  [1015,'LEGAL','2026-02-01','2026-02-01'],[1015,'LEGAL','2026-02-16','2026-02-16'],
  [1016,'NIGHT','2026-02-23','2026-02-25'],
  [1017,'ANNUAL','2026-02-13','2026-02-13'],[1017,'NIGHT','2026-02-18','2026-02-20'],[1017,'REST','2026-02-21','2026-02-22'],
  [1018,'NIGHT','2026-02-14','2026-02-17'],[1018,'REST','2026-02-18','2026-02-19'],[1018,'LEGAL','2026-02-25','2026-02-25'],
  [1019,'NIGHT','2026-02-05','2026-02-07'],[1019,'REST','2026-02-08','2026-02-09'],[1019,'ANNUAL','2026-02-13','2026-02-13'],[1019,'LEGAL','2026-02-24','2026-02-24']
];

const NEED = {
  A1:[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1,1,1,1,1,1,1,1,2,2],
  A:[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1,1,1,2,2,2,2,2,2,2],
  A2:[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  B1:[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1,1,1,2,2,2,2,2,2,2],
  B2:[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1,1,1,2,2,2,2,2,2,2]
};

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function nowStamp() { const d = new Date(); const p=(n)=>String(n).padStart(2,'0'); return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }
function startServer() { return spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' }); }

(async () => {
  ensureDir(ART_DIR);
  const reportPath = path.join(ART_DIR, `report-${nowStamp()}.json`);
  const server = startServer();
  const browser = await chromium.launch({ headless: true });

  const report = { rounds: ROUNDS, timestamp: new Date().toISOString(), summary: {}, details: [] };

  try {
    for (let round = 1; round <= ROUNDS; round += 1) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => typeof CSPSolver !== 'undefined' && typeof Store !== 'undefined', null, { timeout: 120000 });

      const result = await page.evaluate(async ({ staffRows, fixedRows, needMap }) => {
        const startDate = '2026-01-26';
        const endDate = '2026-02-25';

        const dateList = [];
        {
          const c = new Date(startDate);
          const e = new Date(endDate);
          while (c <= e) {
            const y = c.getFullYear();
            const m = String(c.getMonth() + 1).padStart(2, '0');
            const d = String(c.getDate()).padStart(2, '0');
            dateList.push(`${y}-${m}-${d}`);
            c.setDate(c.getDate() + 1);
          }
        }

        const staffData = staffRows.map(([id, name, target, score]) => ({ id, staffId: String(id), name, score, '应上白班天数': target }));
        const personalRequests = {};
        const nightSchedule = {};
        const restDays = {};
        staffData.forEach((s) => { personalRequests[s.staffId] = {}; nightSchedule[s.staffId] = {}; });

        fixedRows.forEach(([id, type, s, e]) => {
          const sid = String(id);
          let c = new Date(s);
          const end = new Date(e);
          while (c <= end) {
            const y = c.getFullYear();
            const m = String(c.getMonth() + 1).padStart(2, '0');
            const d = String(c.getDate()).padStart(2, '0');
            const ds = `${y}-${m}-${d}`;
            if (dateList.includes(ds)) {
              if (type === 'NIGHT') nightSchedule[sid][ds] = 'NIGHT';
              if (type === 'ANNUAL' || type === 'LEGAL' || type === 'REST') personalRequests[sid][ds] = type;
            }
            c.setDate(c.getDate() + 1);
          }
        });

        const dailyDemand = {};
        dateList.forEach((d, idx) => {
          dailyDemand[d] = {
            A1: needMap.A1[idx], A: needMap.A[idx], A2: needMap.A2[idx], B1: needMap.B1[idx], B2: needMap.B2[idx]
          };
        });
        Store.updateState({ minimumManpowerConfig: { dailyDemand } }, false);

        const day = await CSPSolver.generateDayShiftSchedule({
          staffData,
          scheduleConfig: { startDate, endDate },
          personalRequests,
          restDays,
          nightSchedule,
          rules: {}
        });

        const schedule = day.schedule || {};
        const stats = day.stats || {};
        const meta = day.meta || {};
        const checks = {
          fixedMonthlyShift: { ok: true, n: 0 },
          whiteDaysEqualTarget: { ok: true, n: 0 },
          minimumManpower: { ok: true, n: 0 },
          noNightAndDaySameDate: { ok: true, n: 0 },
          continuityBounds: { ok: true, n: 0 },
          functionTotals: { ok: true, n: 0 },
          vacationClearIntegrity: { ok: true, n: 0 }
        };

        const monthlyShiftAssignments = stats.monthlyShiftAssignments || {};
        staffData.forEach((s) => {
          const sid = s.staffId;
          const shift = monthlyShiftAssignments[sid];
          let cnt = 0;
          dateList.forEach((d) => {
            const v = schedule[sid]?.[d];
            if (['A1', 'A', 'A2', 'B1', 'B2'].includes(v)) {
              cnt += 1;
              if (shift && v !== shift) { checks.fixedMonthlyShift.ok = false; checks.fixedMonthlyShift.n += 1; }
            }
            if (v && nightSchedule[sid]?.[d]) { checks.noNightAndDaySameDate.ok = false; checks.noNightAndDaySameDate.n += 1; }
          });
          const target = s['应上白班天数'];
          const maxExtra = 1;
          if (cnt < target || cnt > target + maxExtra) { checks.whiteDaysEqualTarget.ok = false; checks.whiteDaysEqualTarget.n += 1; }

          const relaxMap = { L0: { maxWork: 6, maxRest: 4 }, L1: { maxWork: 7, maxRest: 4 }, L2: { maxWork: 7, maxRest: 5 }, L3: { maxWork: 8, maxRest: 5 } };
          const rb = relaxMap[stats.relaxationLevel] || relaxMap.L0;
          const fixedNightSet = new Set(Object.keys(nightSchedule[sid] || {}));
          let curr = null, len = 0;
          const flush = () => {
            if (!curr) return;
            if (curr === 'W' && len > rb.maxWork) { checks.continuityBounds.ok = false; checks.continuityBounds.n += 1; }
            if (curr === 'R' && len > rb.maxRest) { checks.continuityBounds.ok = false; checks.continuityBounds.n += 1; }
          };
          dateList.forEach((d, idx) => {
            const w = !!schedule[sid]?.[d] || fixedNightSet.has(d);
            const t = w ? 'W' : 'R';
            if (idx === 0) { curr = t; len = 1; return; }
            if (t === curr) len += 1; else { flush(); curr = t; len = 1; }
          });
          flush();
        });

        dateList.forEach((d) => {
          const count = { A1: 0, A: 0, A2: 0, B1: 0, B2: 0 };
          Object.keys(schedule).forEach((sid) => { const s = schedule[sid]?.[d]; if (count[s] != null) count[s] += 1; });
          ['A1', 'A', 'A2', 'B1', 'B2'].forEach((shift) => {
            const need = dailyDemand[d][shift];
            if (count[shift] < need) { checks.minimumManpower.ok = false; checks.minimumManpower.n += 1; }
          });
        });

        let fnTotal = 0;
        Object.values(stats.dailyFunctionStats || {}).forEach((row) => { Object.values(row || {}).forEach((v) => { fnTotal += Number(v) || 0; }); });
        if (fnTotal !== (stats.totalAssignments || 0)) { checks.functionTotals.ok = false; checks.functionTotals.n += 1; }

        (meta.vacationCleared || []).forEach((c) => {
          const reqType = personalRequests?.[c.staffId]?.[c.dateStr];
          if (!(reqType === 'ANNUAL' || reqType === 'LEGAL')) { checks.vacationClearIntegrity.ok = false; checks.vacationClearIntegrity.n += 1; }
          if (meta.requestStateAfterSolve?.[c.staffId]?.[c.dateStr]) { checks.vacationClearIntegrity.ok = false; checks.vacationClearIntegrity.n += 1; }
        });

        return { stats, meta, checks };
      }, { staffRows: STAFF, fixedRows: FIXED, needMap: NEED });

      report.details.push({ round, ...result });
      await context.close();
    }

    const hardCheckKeys = [
      'fixedMonthlyShift',
      'whiteDaysEqualTarget',
      'minimumManpower',
      'noNightAndDaySameDate',
      'continuityBounds',
      'functionTotals',
      'vacationClearIntegrity'
    ];

    const failedRounds = report.details.filter((d) => {
      const hard = d.stats?.hardViolations?.total || 0;
      const checkFail = hardCheckKeys.some((k) => d.checks?.[k]?.ok !== true);
      return hard > 0 || checkFail;
    }).map((d) => d.round);

    report.summary = {
      hardAllZero: failedRounds.length === 0 && report.details.every((d) => (d.stats?.hardViolations?.total || 0) === 0),
      allChecksPass: failedRounds.length === 0,
      failedRounds,
      rounds: report.details.map((d) => ({
        round: d.round,
        hardViolationTotal: d.stats?.hardViolations?.total || 0,
        dailyShortage: d.stats?.hardViolations?.dailyShortage || 0,
        targetMismatch: d.stats?.hardViolations?.targetMismatch || 0,
        maxWorkViolation: d.stats?.hardViolations?.maxWorkViolation || 0,
        maxRestViolation: d.stats?.hardViolations?.maxRestViolation || 0,
        relaxationLevel: d.stats?.relaxationLevel || null,
        vacationCleared: (d.meta?.vacationCleared || []).length,
        checks: d.checks
      }))
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log('白班算法完整校验完成');
    console.log(`报告: ${reportPath}`);
    console.log(`hardAllZero=${report.summary.hardAllZero}, allChecksPass=${report.summary.allChecksPass}`);

    if (!report.summary.hardAllZero || !report.summary.allChecksPass) process.exitCode = 2;
  } catch (error) {
    fs.writeFileSync(reportPath, JSON.stringify({ error: String(error?.stack || error) }, null, 2), 'utf8');
    console.error('校验执行失败:', error);
    console.error(`错误报告: ${reportPath}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})();
