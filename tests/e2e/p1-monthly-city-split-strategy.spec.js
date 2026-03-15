const { test, expect } = require('playwright/test');
const {
  waitForMonthlyScheduleReady,
  suppressBlockingDialogs,
  setupMonthlyScheduleScenario
} = require('./utils/monthly-hard-constraint-fixture');

test.describe('P1 Monthly City Split Strategy', () => {
  test('TC-P1-MON-CITY-SPLIT city_shift_split 按城市班别拆分生效', async ({ page }) => {
    test.setTimeout(480000);

    await page.goto('/index.html');
    await waitForMonthlyScheduleReady(page);
    await suppressBlockingDialogs(page);

    const baseline = await setupMonthlyScheduleScenario(page);
    const configId = baseline && baseline.active ? baseline.active.monthlyScheduleConfigId : null;
    expect(configId).toBeTruthy();

    const result = await page.evaluate(async (cid) => {
      const shiftKeys = ['A1', 'A', 'A2', 'B1', 'B2'];
      const cfg = Store.getMonthlyScheduleConfig(cid);
      if (!cfg) throw new Error('配置不存在');

      const staff = (Store.getCurrentStaffData() || []).map((row) => ({ ...row }));
      if (staff.length < 12) {
        throw new Error(`人员数量不足: ${staff.length}`);
      }
      staff.forEach((row, idx) => {
        const isCd = idx % 3 === 0;
        row.city = isCd ? 'CD' : 'SH';
        row.location = isCd ? '成都' : '上海';
      });
      Store.updateState({ staffData: staff }, true);

      const mmConfig = { ...(Store.getState('minimumManpowerConfig') || {}) };
      mmConfig.cityShiftSplit = {
        SH: { A1: 3, A: 3, A2: 1, B1: 2, B2: 1, NIGHT: 2 },
        CD: { A1: 1, A: 1, A2: 2, B1: 2, B2: 4, NIGHT: 2 }
      };
      Store.updateState({ minimumManpowerConfig: mmConfig }, true);

      cfg.algorithmConfig = {
        ...MonthlyScheduleConfigManager.getDefaultAlgorithmConfig(),
        algorithmMode: 'csp',
        citySplitStrategy: 'city_shift_split'
      };
      await DB.saveMonthlyScheduleConfig(cfg);
      await Store.saveState(false);

      await MonthlyScheduleConfigManager.generateMonthlyScheduleConfig();

      const next = Store.getMonthlyScheduleConfig(cid);
      if (!next) throw new Error('生成后配置不存在');
      const stats = (next.dayShiftReport && next.dayShiftReport.stats) ? next.dayShiftReport.stats : {};
      const monthly = stats.monthlyShiftAssignments || {};
      const rows = next.staffScheduleData || {};
      const cityHeadcount = { SH: 0, CD: 0 };
      const cityCounts = {
        SH: { A1: 0, A: 0, A2: 0, B1: 0, B2: 0 },
        CD: { A1: 0, A: 0, A2: 0, B1: 0, B2: 0 }
      };

      Object.keys(rows).forEach((sid) => {
        const row = rows[sid] || {};
        const city = String(row.city || '').toUpperCase() === 'CD' ? 'CD' : 'SH';
        cityHeadcount[city] += 1;
        const shift = String(monthly[sid] || row.shiftType || '').trim();
        if (cityCounts[city][shift] != null) {
          cityCounts[city][shift] += 1;
        }
      });

      const targets = {
        SH: MonthlyScheduleConfigManager.allocateIntegerByWeights(cityHeadcount.SH, mmConfig.cityShiftSplit.SH || {}, shiftKeys),
        CD: MonthlyScheduleConfigManager.allocateIntegerByWeights(cityHeadcount.CD, mmConfig.cityShiftSplit.CD || {}, shiftKeys)
      };

      const mismatch = [];
      ['SH', 'CD'].forEach((city) => {
        shiftKeys.forEach((shift) => {
          const actual = Number(cityCounts[city][shift] || 0);
          const expected = Number(targets[city][shift] || 0);
          if (actual !== expected) {
            mismatch.push({ city, shift, actual, expected });
          }
        });
      });

      return {
        mismatch,
        cityHeadcount,
        cityCounts,
        targets,
        hardTotal: Number((stats.hardViolations && stats.hardViolations.total) || 0)
      };
    }, configId);

    expect(result.mismatch).toEqual([]);
  });
});
