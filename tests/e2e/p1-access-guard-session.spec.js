const { test, expect } = require('playwright/test');
const { waitForAppReady } = require('./utils/scheduler-fixture');

test.describe('P1 Session Guard', () => {
  test('TC-P1-SESSION-01 工号会话与角色权限守卫生效', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'load' });
    await waitForAppReady(page);

    await expect(page.locator('#sessionToolbar')).toBeVisible();
    await expect(page.locator('#sessionEmpNoSelect')).toBeVisible();

    const baseline = await page.evaluate(() => {
      return {
        hasAccessGuard: typeof AccessGuard !== 'undefined',
        hasStoreSession: typeof Store !== 'undefined' && typeof Store.getCurrentSession === 'function',
        users: typeof Store !== 'undefined' && typeof Store.getUsers === 'function'
          ? Store.getUsers().map((u) => ({ empNo: u.empNo, role: u.role, cityAffiliation: u.cityAffiliation }))
          : []
      };
    });

    expect(baseline.hasAccessGuard).toBeTruthy();
    expect(baseline.hasStoreSession).toBeTruthy();
    expect(baseline.users.length).toBeGreaterThanOrEqual(4);

    await page.selectOption('#sessionEmpNoSelect', '900401');
    await page.click('#sessionSwitchBtn');

    await expect(page.locator('#sessionAuditBtn')).toBeVisible();
    await expect(page.locator('#sessionManageBtn')).toBeHidden();
    await page.click('#sessionAuditBtn');
    await expect(page.locator('h3:has-text("审计日志")')).toBeVisible();
    await expect(page.locator('#audit-log-tbody')).toBeVisible();
    await page.click('#audit-close-btn');

    const auditorPermission = await page.evaluate(() => {
      return {
        session: Store.getCurrentSession(),
        mutate: AccessGuard.checkActionPermission('scheduleResult', 'edit', { cityScope: 'SH' })
      };
    });

    expect(auditorPermission.session.empNo).toBe('900401');
    expect(auditorPermission.session.role).toBe('AUDITOR');
    expect(auditorPermission.mutate.allowed).toBeFalsy();

    await page.selectOption('#sessionEmpNoSelect', '900101');
    await page.click('#sessionSwitchBtn');

    const cityPermission = await page.evaluate(() => {
      return {
        session: Store.getCurrentSession(),
        sh: AccessGuard.checkActionPermission('staff', 'edit', { cityScope: 'SH' }),
        cd: AccessGuard.checkActionPermission('staff', 'edit', { cityScope: 'CD' }),
        all: AccessGuard.checkActionPermission('staff', 'edit', { cityScope: 'ALL' })
      };
    });

    expect(cityPermission.session.empNo).toBe('900101');
    expect(cityPermission.session.role).toBe('CITY_SCHEDULER');
    expect(cityPermission.sh.allowed).toBeTruthy();
    expect(cityPermission.cd.allowed).toBeFalsy();
    expect(cityPermission.all.allowed).toBeFalsy();

    await expect(page.locator('#sessionAuditBtn')).toBeHidden();
  });
});
