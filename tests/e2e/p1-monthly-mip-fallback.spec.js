const { test, expect } = require('playwright/test');
const {
  waitForMonthlyScheduleReady,
  suppressBlockingDialogs,
  setupMonthlyScheduleScenario
} = require('./utils/monthly-hard-constraint-fixture');

test.describe('P1 Monthly Schedule MIP Fallback', () => {
  test('TC-P1-MON-MIP-FAIL-TO-CSP MIP失效时自动CSP托底（含历史禁用配置）', async ({ page }) => {
    test.setTimeout(420000);

    await page.goto('/index.html');
    await waitForMonthlyScheduleReady(page);
    await suppressBlockingDialogs(page);

    const baseline = await setupMonthlyScheduleScenario(page);
    const configId = baseline && baseline.active ? baseline.active.monthlyScheduleConfigId : null;
    expect(configId).toBeTruthy();

    const fallbackResult = await page.evaluate(async (cid) => {
      const cfg = Store.getMonthlyScheduleConfig(cid);
      if (!cfg) throw new Error('配置不存在');
      cfg.algorithmConfig = {
        ...MonthlyScheduleConfigManager.getDefaultAlgorithmConfig(),
        algorithmMode: 'mip',
        strictMIP: true,
        allowCspFallbackOnMipFailure: false
      };
      await DB.saveMonthlyScheduleConfig(cfg);
      await Store.saveState(false);

      const origin = MIPDayShiftSolver.generateDayShiftScheduleMIP;
      MIPDayShiftSolver.generateDayShiftScheduleMIP = async () => {
        throw new Error('PW_FORCED_MIP_FAILURE');
      };

      try {
        await MonthlyScheduleConfigManager.generateMonthlyScheduleConfig();
      } finally {
        MIPDayShiftSolver.generateDayShiftScheduleMIP = origin;
      }

      const next = Store.getMonthlyScheduleConfig(cid);
      const report = (next && next.dayShiftReport) ? next.dayShiftReport : {};
      const solver = (report.meta && report.meta.solver) ? report.meta.solver : {};
      const hard = (report.stats && report.stats.hardViolations) ? report.stats.hardViolations : {};
      return {
        usedMode: solver.usedMode || '',
        requestedMode: solver.requestedMode || '',
        fallbackReason: solver.fallbackReason || '',
        hardTotal: Number(hard.total || 0)
      };
    }, configId);

    expect(fallbackResult.requestedMode.toLowerCase()).toBe('mip');
    expect(fallbackResult.usedMode.toLowerCase()).toBe('csp');
    expect(fallbackResult.fallbackReason).toContain('托底');
  });
});
