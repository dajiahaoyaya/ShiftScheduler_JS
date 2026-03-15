#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const {
  SCREENSHOT_PERIOD,
  waitForMonthlyScheduleReady,
  suppressBlockingDialogs,
  setupMonthlyScheduleScenario,
  runMonthlyScheduleSelfRepair
} = require('../tests/e2e/utils/monthly-hard-constraint-fixture');

const ROOT = process.cwd();
const PORT = Number(process.env.MONTHLY_EXPORT_PORT || 8000);
const BASE_URL = `http://127.0.0.1:${PORT}/index.html`;
const OUT_DIR = path.join(ROOT, 'artifacts', 'monthly-hard-constraint');

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
  const child = spawn('python3', ['-m', 'http.server', String(PORT)], {
    cwd: ROOT,
    stdio: 'ignore'
  });
  return child;
}

function escapeCsv(value) {
  const s = String(value == null ? '' : value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# 月度班次配置实际结果（Playwright 导出）');
  lines.push('');
  lines.push(`- 导出时间: ${new Date().toISOString()}`);
  lines.push(`- 排班周期: ${report.period.startDate} ~ ${report.period.endDate}`);
  lines.push(`- 配置ID: ${report.config.configId}`);
  lines.push(`- 配置名称: ${report.config.name}`);
  lines.push(`- 求解模式: 请求=${report.solver.requestedMode || '-'} / 实际=${report.solver.usedMode || '-'}`);
  lines.push(`- strictMIP: ${report.solver.strictMIP ? 'ON' : 'OFF'}`);
  lines.push('');
  lines.push('## 硬约束');
  lines.push('');
  lines.push(`- total: ${report.hard.total}`);
  lines.push(`- dailyShortage: ${report.hard.dailyShortage}`);
  lines.push(`- targetMismatch: ${report.hard.targetMismatch}`);
  lines.push(`- maxWorkViolation: ${report.hard.maxWorkViolation}`);
  lines.push(`- maxRestViolation: ${report.hard.maxRestViolation}`);
  lines.push('');
  lines.push('## 软约束');
  lines.push('');
  lines.push(`- softPenalty: ${report.soft.softPenalty}`);
  lines.push(`- warnings: ${report.soft.warningCount}`);
  lines.push(`- errors: ${report.soft.errorCount}`);
  lines.push('');
  if (report.soft.warningSample.length > 0) {
    lines.push('### 软约束告警样例');
    lines.push('');
    report.soft.warningSample.forEach((w) => lines.push(`- ${w}`));
    lines.push('');
  }
  lines.push('## 班别分布');
  lines.push('');
  Object.entries(report.shiftDistribution || {}).forEach(([k, v]) => {
    lines.push(`- ${k}: ${v}`);
  });
  lines.push('');
  lines.push('## 每日需求与实际（前15天）');
  lines.push('');
  lines.push('| 日期 | A1(需/实) | A(需/实) | A2(需/实) | B1(需/实) | B2(需/实) | 缺口 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  report.dailySummary.slice(0, 15).forEach((d) => {
    lines.push(`| ${d.date} | ${d.demand.A1}/${d.actual.A1} | ${d.demand.A}/${d.actual.A} | ${d.demand.A2}/${d.actual.A2} | ${d.demand.B1}/${d.actual.B1} | ${d.demand.B2}/${d.actual.B2} | ${d.shortageTotal} |`);
  });
  lines.push('');
  lines.push('## 人员汇总');
  lines.push('');
  lines.push('| staffId | 姓名 | 班别 | 应上白班 | 实际白班 | 年假 | 法休 | 夜班 | 夜后休整 |');
  lines.push('|---|---|---|---:|---:|---:|---:|---:|---:|');
  report.staffSummary.forEach((s) => {
    lines.push(`| ${s.staffId} | ${s.staffName} | ${s.shiftType || '-'} | ${s.expectedDayShiftDays} | ${s.actualDayShiftDays} | ${s.annualCount} | ${s.legalCount} | ${s.nightCount} | ${s.postNightRestCount} |`);
  });
  return lines.join('\n');
}

function renderCsv(report) {
  const header = [
    'staffId',
    'staffName',
    'shiftType',
    'expectedDayShiftDays',
    'actualDayShiftDays',
    'annualCount',
    'legalCount',
    'nightCount',
    'postNightRestCount',
    ...report.dates
  ];

  const lines = [header.map(escapeCsv).join(',')];

  report.staffRows.forEach((row) => {
    const fixed = [
      row.staffId,
      row.staffName,
      row.shiftType || '',
      row.expectedDayShiftDays,
      row.actualDayShiftDays,
      row.annualCount,
      row.legalCount,
      row.nightCount,
      row.postNightRestCount
    ];
    const dayCells = report.dates.map((d) => row.dayStatus[d] || '');
    lines.push([...fixed, ...dayCells].map(escapeCsv).join(','));
  });

  return lines.join('\n');
}

(async () => {
  ensureDir(OUT_DIR);
  const ts = stamp();
  const jsonPath = path.join(OUT_DIR, `full-monthly-result-${ts}.json`);
  const mdPath = path.join(OUT_DIR, `full-monthly-result-${ts}.md`);
  const csvPath = path.join(OUT_DIR, `full-monthly-result-${ts}.csv`);

  const server = startServer();
  let browser;

  try {
    await waitServerReady(BASE_URL);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(BASE_URL);
    await waitForMonthlyScheduleReady(page);
    await suppressBlockingDialogs(page);

    const baseline = await setupMonthlyScheduleScenario(page);
    const repair = await runMonthlyScheduleSelfRepair(page);

    const fullResult = await page.evaluate(({ period }) => {
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

      const dates = buildDateList(period.startDate, period.endDate);
      const configId = Store.getState('activeMonthlyScheduleConfigId');
      const cfg = configId ? Store.getMonthlyScheduleConfig(configId) : null;
      if (!cfg) {
        throw new Error('未找到激活的月度班次配置');
      }

      const stats = (cfg.dayShiftReport && cfg.dayShiftReport.stats) ? cfg.dayShiftReport.stats : {};
      const meta = (cfg.dayShiftReport && cfg.dayShiftReport.meta) ? cfg.dayShiftReport.meta : {};
      const hard = stats.hardViolations || {};
      const warnings = Array.isArray(stats.warnings) ? stats.warnings : [];
      const errors = Array.isArray(stats.errors) ? stats.errors : [];
      const shiftDistribution = stats.shiftDistribution || {};
      const solver = meta.solver || {};

      const minimumConfig = Store.getState('minimumManpowerConfig') || {};
      const demand = minimumConfig.dailyDemand || {};

      const requests = Store.getAllPersonalRequests ? (Store.getAllPersonalRequests() || {}) : (Store.state.personalRequests || {});
      const nightMap = (meta.nightShiftTypeMapSnapshot && typeof meta.nightShiftTypeMapSnapshot === 'object')
        ? meta.nightShiftTypeMapSnapshot
        : {};

      const staffRows = [];
      const staffSummary = [];

      const cfgRows = cfg.staffScheduleData || {};
      Object.keys(cfgRows).sort().forEach((sid) => {
        const row = cfgRows[sid] || {};
        const daily = row.dailySchedule || {};
        const reqRow = requests[sid] || {};
        const nightRow = nightMap[sid] || {};

        let actualDayShiftDays = 0;
        let annualCount = 0;
        let legalCount = 0;
        let nightCount = 0;
        let postNightRestCount = 0;

        const dayStatus = {};
        dates.forEach((d) => {
          const reqType = reqRow[d] || '';
          const nt = nightRow[d] || '';
          const skill = daily[d] || '';

          if (skill) {
            actualDayShiftDays += 1;
            dayStatus[d] = `${row.shiftType || ''}/${skill}`;
            return;
          }
          if (nt === 'night') {
            nightCount += 1;
            dayStatus[d] = 'NIGHT';
            return;
          }
          if (nt === 'rest') {
            postNightRestCount += 1;
            dayStatus[d] = 'POST_NIGHT_REST';
            return;
          }
          if (reqType === 'ANNUAL') {
            annualCount += 1;
            dayStatus[d] = 'ANNUAL';
            return;
          }
          if (reqType === 'LEGAL') {
            legalCount += 1;
            dayStatus[d] = 'LEGAL';
            return;
          }
          if (reqType === 'REQ' || reqType === 'REST' || reqType === 'SICK') {
            dayStatus[d] = reqType;
            return;
          }
          if (Store.isRestDay && Store.isRestDay(d)) {
            dayStatus[d] = 'REST_DAY';
            return;
          }
          dayStatus[d] = '';
        });

        let expectedDayShiftDays = Number(row.expectedDayShiftDays || 0);
        if (!Number.isFinite(expectedDayShiftDays) || expectedDayShiftDays <= 0) {
          const expectedMap = (typeof MonthlyScheduleConfigManager !== 'undefined' && MonthlyScheduleConfigManager.calculateExpectedDayShiftMap)
            ? MonthlyScheduleConfigManager.calculateExpectedDayShiftMap(
                dates.map((x) => ({ dateStr: x })),
                nightMap
              )
            : {};
          expectedDayShiftDays = Number(expectedMap[sid] || 0);
        }

        const item = {
          staffId: sid,
          staffName: row.staffName || '',
          shiftType: row.shiftType || '',
          expectedDayShiftDays,
          actualDayShiftDays,
          annualCount,
          legalCount,
          nightCount,
          postNightRestCount,
          dayStatus
        };

        staffRows.push(item);
        staffSummary.push({
          staffId: item.staffId,
          staffName: item.staffName,
          shiftType: item.shiftType,
          expectedDayShiftDays: item.expectedDayShiftDays,
          actualDayShiftDays: item.actualDayShiftDays,
          annualCount: item.annualCount,
          legalCount: item.legalCount,
          nightCount: item.nightCount,
          postNightRestCount: item.postNightRestCount
        });
      });

      const dailySummary = dates.map((d) => {
        const actual = { A1: 0, A: 0, A2: 0, B1: 0, B2: 0 };
        staffRows.forEach((s) => {
          const v = s.dayStatus[d];
          if (!v || !v.includes('/')) return;
          const shift = v.split('/')[0];
          if (actual[shift] != null) actual[shift] += 1;
        });
        const dayDemand = demand[d] || {};
        const demandRow = {
          A1: Number(dayDemand.A1 || 0),
          A: Number(dayDemand.A || 0),
          A2: Number(dayDemand.A2 || 0),
          B1: Number(dayDemand.B1 || 0),
          B2: Number(dayDemand.B2 || 0)
        };
        const shortage = {
          A1: Math.max(0, demandRow.A1 - actual.A1),
          A: Math.max(0, demandRow.A - actual.A),
          A2: Math.max(0, demandRow.A2 - actual.A2),
          B1: Math.max(0, demandRow.B1 - actual.B1),
          B2: Math.max(0, demandRow.B2 - actual.B2)
        };
        const shortageTotal = shortage.A1 + shortage.A + shortage.A2 + shortage.B1 + shortage.B2;
        return { date: d, demand: demandRow, actual, shortage, shortageTotal };
      });

      return {
        period,
        config: {
          configId,
          name: cfg.name || '',
          generatedAt: cfg.dayShiftReport ? cfg.dayShiftReport.generatedAt : null
        },
        solver: {
          requestedMode: solver.requestedMode || '',
          usedMode: solver.usedMode || '',
          strictMIP: solver.strictMIP === true,
          fallbackReason: solver.fallbackReason || ''
        },
        hard: {
          total: Number(hard.total || 0),
          dailyShortage: Number(hard.dailyShortage || 0),
          targetMismatch: Number(hard.targetMismatch || 0),
          maxWorkViolation: Number(hard.maxWorkViolation || 0),
          maxRestViolation: Number(hard.maxRestViolation || 0)
        },
        soft: {
          softPenalty: Number(stats.softPenalty || 0),
          warningCount: warnings.length,
          errorCount: errors.length,
          warningSample: warnings.slice(0, 15),
          errorSample: errors.slice(0, 15)
        },
        shiftDistribution,
        dates,
        dailySummary,
        staffSummary,
        staffRows
      };
    }, { period: SCREENSHOT_PERIOD });

    const out = {
      generatedAt: new Date().toISOString(),
      source: 'playwright',
      baseline,
      repair,
      fullResult
    };

    fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2), 'utf8');
    fs.writeFileSync(mdPath, renderMarkdown(fullResult), 'utf8');
    fs.writeFileSync(csvPath, renderCsv(fullResult), 'utf8');

    console.log(JSON.stringify({
      jsonPath,
      mdPath,
      csvPath,
      hard: fullResult.hard,
      soft: {
        softPenalty: fullResult.soft.softPenalty,
        warningCount: fullResult.soft.warningCount,
        errorCount: fullResult.soft.errorCount
      }
    }, null, 2));
  } catch (error) {
    console.error('export-monthly-result failed:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server && !server.killed) server.kill('SIGTERM');
  }
})();
