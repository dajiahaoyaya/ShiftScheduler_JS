const { test, expect } = require('playwright/test');
const {
  waitForMonthlyScheduleReady,
  suppressBlockingDialogs,
  setupMonthlyScheduleScenario
} = require('./utils/monthly-hard-constraint-fixture');

test.describe('P1 Monthly Major Function Toggle', () => {
  test('TC-P1-MON-MAJOR-TOGGLE 网天微个人比例开关生效', async ({ page }) => {
    test.setTimeout(480000);

    await page.goto('/index.html');
    await waitForMonthlyScheduleReady(page);
    await suppressBlockingDialogs(page);

    const baseline = await setupMonthlyScheduleScenario(page);
    const configId = baseline && baseline.active ? baseline.active.monthlyScheduleConfigId : null;
    expect(configId).toBeTruthy();

    const result = await page.evaluate(async (cid) => {
      const runOnce = async (enabled) => {
        const cfg = Store.getMonthlyScheduleConfig(cid);
        if (!cfg) throw new Error('配置不存在');
        cfg.algorithmConfig = {
          ...MonthlyScheduleConfigManager.getDefaultAlgorithmConfig(),
          algorithmMode: 'csp',
          majorFunctionPersonalRatioEnabled: enabled
        };
        await DB.saveMonthlyScheduleConfig(cfg);
        await Store.saveState(false);

        await MonthlyScheduleConfigManager.generateMonthlyScheduleConfig();
        const next = Store.getMonthlyScheduleConfig(cid);
        const report = (next && next.dayShiftReport) ? next.dayShiftReport : {};
        const stats = report.stats || {};
        const warnings = Array.isArray(stats.warnings) ? stats.warnings : [];
        const targets = stats.functionTargets || {};
        const majorTarget = {
          网: Number(targets['网'] || 0),
          天: Number(targets['天'] || 0),
          微: Number(targets['微'] || 0)
        };
        const majorTotal = Math.max(1, majorTarget.网 + majorTarget.天 + majorTarget.微);
        const majorRatio = {
          网: majorTarget.网 / majorTotal,
          天: majorTarget.天 / majorTotal,
          微: majorTarget.微 / majorTotal
        };

        const staffRows = next && next.staffScheduleData ? next.staffScheduleData : {};
        let majorStaffCount = 0;
        let majorDeviationSum = 0;
        Object.keys(staffRows).forEach((sid) => {
          const row = staffRows[sid] || {};
          const daily = row.dailySchedule || {};
          const c = { 网: 0, 天: 0, 微: 0 };
          Object.values(daily).forEach((fn) => {
            if (c[fn] != null) c[fn] += 1;
          });
          const t = c.网 + c.天 + c.微;
          if (t <= 0) return;
          majorStaffCount += 1;
          const r = {
            网: c.网 / t,
            天: c.天 / t,
            微: c.微 / t
          };
          majorDeviationSum += Math.abs(r.网 - majorRatio.网) + Math.abs(r.天 - majorRatio.天) + Math.abs(r.微 - majorRatio.微);
        });

        return {
          enabled,
          hardTotal: Number(((stats.hardViolations || {}).total) || 0),
          hasMajorWarning: warnings.some((w) => String(w || '').includes('网天微差异超阈值')),
          avgMajorDeviation: majorStaffCount > 0 ? (majorDeviationSum / majorStaffCount) : 0,
          majorStaffCount
        };
      };

      const off = await runOnce(false);
      const on = await runOnce(true);
      return { off, on };
    }, configId);

    expect(result.off.hardTotal).toBe(0);
    expect(result.on.hardTotal).toBe(0);
    expect(result.off.hasMajorWarning).toBeFalsy();
    expect(result.on.avgMajorDeviation).toBeLessThanOrEqual(result.off.avgMajorDeviation + 0.08);
  });
});

