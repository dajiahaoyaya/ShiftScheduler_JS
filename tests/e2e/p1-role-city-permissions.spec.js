const { test, expect } = require('playwright/test');
const { waitForAppReady } = require('./utils/scheduler-fixture');

async function switchSession(page, empNo) {
  await page.selectOption('#sessionEmpNoSelect', empNo);
  await page.click('#sessionSwitchBtn');
  await page.waitForFunction((targetEmpNo) => {
    return typeof Store !== 'undefined'
      && typeof Store.getCurrentSession === 'function'
      && Store.getCurrentSession()
      && Store.getCurrentSession().empNo === targetEmpNo;
  }, empNo, { timeout: 5000 });
}

test.describe('P1 Role City Permission Matrix', () => {
  test('TC-P1-SESSION-02 角色与城市边界矩阵生效', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'load' });
    await waitForAppReady(page);

    await expect(page.locator('#sessionToolbar')).toBeVisible();
    await expect(page.locator('#sessionEmpNoSelect')).toBeVisible();

    await switchSession(page, '900000');
    await page.evaluate(() => {
      const prefix = 'PW_SCOPE_MATRIX_';
      const existing = (typeof Store !== 'undefined' && typeof Store.getSchedulePeriodConfigs === 'function')
        ? (Store.getSchedulePeriodConfigs({ raw: true }) || [])
        : [];
      const hasScope = (scope) => existing.some((cfg) => cfg && cfg.name && cfg.name.startsWith(`${prefix}${scope}`));
      const baseSchedule = {
        startDate: '2026-01-26',
        endDate: '2026-02-25',
        year: 2026,
        month: 2
      };
      if (!hasScope('SH')) {
        Store.createSchedulePeriodConfig(`${prefix}SH`, baseSchedule, {}, 'SH');
      }
      if (!hasScope('CD')) {
        Store.createSchedulePeriodConfig(`${prefix}CD`, baseSchedule, {}, 'CD');
      }
      if (!hasScope('ALL')) {
        Store.createSchedulePeriodConfig(`${prefix}ALL`, baseSchedule, {}, 'ALL');
      }
    });

    const matrix = [
      {
        empNo: '900000',
        role: 'SYS_ADMIN',
        cityAffiliation: 'ALL',
        sh: true,
        cd: true,
        all: true,
        visibleScopes: ['ALL', 'CD', 'SH'],
        canManageUsers: true,
        canViewAudit: true
      },
      {
        empNo: '900101',
        role: 'CITY_SCHEDULER',
        cityAffiliation: 'SH',
        sh: true,
        cd: false,
        all: false,
        visibleScopes: ['SH'],
        canManageUsers: false,
        canViewAudit: false
      },
      {
        empNo: '900201',
        role: 'CITY_SCHEDULER',
        cityAffiliation: 'CD',
        sh: false,
        cd: true,
        all: false,
        visibleScopes: ['CD'],
        canManageUsers: false,
        canViewAudit: false
      },
      {
        empNo: '900301',
        role: 'COORDINATOR',
        cityAffiliation: 'ALL',
        sh: true,
        cd: true,
        all: true,
        visibleScopes: ['ALL', 'CD', 'SH'],
        canManageUsers: false,
        canViewAudit: true
      },
      {
        empNo: '900401',
        role: 'AUDITOR',
        cityAffiliation: 'ALL',
        sh: false,
        cd: false,
        all: false,
        visibleScopes: ['ALL', 'CD', 'SH'],
        canManageUsers: false,
        canViewAudit: true
      }
    ];

    for (const expected of matrix) {
      await switchSession(page, expected.empNo);

      const permission = await page.evaluate(() => {
        const session = Store.getCurrentSession();
        const visibleScopes = Array.from(new Set((Store.getSchedulePeriodConfigs() || []).map((cfg) => String((cfg && cfg.cityScope) || '').toUpperCase()))).sort();
        return {
          session,
          visibleScopes,
          scheduleView: AccessGuard.check('schedule', 'view'),
          mutateSH: AccessGuard.checkActionPermission('staff', 'edit', { cityScope: 'SH' }),
          mutateCD: AccessGuard.checkActionPermission('staff', 'edit', { cityScope: 'CD' }),
          mutateALL: AccessGuard.checkActionPermission('staff', 'edit', { cityScope: 'ALL' }),
          canEditSH: AccessGuard.canEditCity('SH'),
          canEditCD: AccessGuard.canEditCity('CD'),
          canOperateSH: AccessGuard.canOperateScope('SH'),
          canOperateCD: AccessGuard.canOperateScope('CD'),
          canOperateALL: AccessGuard.canOperateScope('ALL')
        };
      });

      expect(permission.session.empNo, `${expected.empNo} session.empNo`).toBe(expected.empNo);
      expect(permission.session.role, `${expected.empNo} role`).toBe(expected.role);
      expect(permission.session.cityAffiliation, `${expected.empNo} cityAffiliation`).toBe(expected.cityAffiliation);
      expect(permission.scheduleView.allowed, `${expected.empNo} schedule view`).toBeTruthy();
      expect(permission.visibleScopes, `${expected.empNo} visible scopes`).toEqual(expected.visibleScopes);

      expect(permission.mutateSH.allowed, `${expected.empNo} mutate SH`).toBe(expected.sh);
      expect(permission.mutateCD.allowed, `${expected.empNo} mutate CD`).toBe(expected.cd);
      expect(permission.mutateALL.allowed, `${expected.empNo} mutate ALL`).toBe(expected.all);

      expect(permission.canEditSH, `${expected.empNo} canEdit SH`).toBe(expected.sh);
      expect(permission.canEditCD, `${expected.empNo} canEdit CD`).toBe(expected.cd);
      expect(permission.canOperateSH, `${expected.empNo} canOperate SH`).toBe(expected.sh);
      expect(permission.canOperateCD, `${expected.empNo} canOperate CD`).toBe(expected.cd);
      expect(permission.canOperateALL, `${expected.empNo} canOperate ALL`).toBe(expected.all);

      if (expected.canManageUsers) {
        await expect(page.locator('#sessionManageBtn')).toBeVisible();
      } else {
        await expect(page.locator('#sessionManageBtn')).toBeHidden();
      }

      if (expected.canViewAudit) {
        await expect(page.locator('#sessionAuditBtn')).toBeVisible();
      } else {
        await expect(page.locator('#sessionAuditBtn')).toBeHidden();
      }
    }
  });
});
