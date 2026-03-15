const { test, expect } = require('playwright/test');
const {
  waitForMonthlyScheduleReady,
  suppressBlockingDialogs,
  setupMonthlyScheduleScenario
} = require('./utils/monthly-hard-constraint-fixture');

test.describe('P1 Monthly Schedule Background Progress', () => {
  test('TC-P1-MON-BG-01 生成中返回列表不打断后台求解', async ({ page }) => {
    test.setTimeout(420000);

    await page.goto('/index.html');
    await waitForMonthlyScheduleReady(page);
    await suppressBlockingDialogs(page);

    const baseline = await setupMonthlyScheduleScenario(page);
    const configId = baseline && baseline.active ? baseline.active.monthlyScheduleConfigId : null;
    expect(configId).toBeTruthy();

    await page.evaluate(() => {
      window.__monthlyBgGenPromise = MonthlyScheduleConfigManager.generateMonthlyScheduleConfig();
    });

    await page.waitForFunction((cid) => {
      const jobs = (Store.getState('monthlyScheduleGenerationJobs') || {});
      const job = jobs[cid];
      return !!job && job.status === 'running';
    }, configId, { timeout: 30000 });

    await page.evaluate(async () => {
      await MonthlyScheduleConfigManager.backToConfigList();
    });

    await page.waitForSelector('text=本月排班配置管理', { timeout: 15000 });
    await expect(page.locator('text=运行中').first()).toBeVisible();

    const stillRunningAfterBack = await page.evaluate((cid) => {
      const jobs = (Store.getState('monthlyScheduleGenerationJobs') || {});
      const job = jobs[cid];
      return !!job && job.status === 'running';
    }, configId);
    expect(stillRunningAfterBack).toBeTruthy();

    await page.waitForFunction((cid) => {
      const jobs = (Store.getState('monthlyScheduleGenerationJobs') || {});
      const job = jobs[cid];
      return !!job && (job.status === 'completed' || job.status === 'failed');
    }, configId, { timeout: 300000 });

    const finalState = await page.evaluate((cid) => {
      const jobs = (Store.getState('monthlyScheduleGenerationJobs') || {});
      const job = jobs[cid] || null;
      const configs = Store.getState('monthlyScheduleConfigs') || [];
      const config = configs.find((c) => c && c.configId === cid) || null;
      return {
        jobStatus: job ? job.status : null,
        hasReport: !!(config && config.dayShiftReport && config.dayShiftReport.stats),
        hardTotal: Number((config && config.dayShiftReport && config.dayShiftReport.stats && config.dayShiftReport.stats.hardViolations && config.dayShiftReport.stats.hardViolations.total) || 0)
      };
    }, configId);

    expect(finalState.jobStatus).toBe('completed');
    expect(finalState.hasReport).toBeTruthy();
  });
});
