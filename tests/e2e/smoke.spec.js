const { test, expect } = require('playwright/test');
const { waitForAppReady } = require('./utils/scheduler-fixture');

const ALLOWED_FAILED_REQUEST_PATTERNS = [
  /\/database\/shiftscheduler\.json$/,
  /^http:\/\/127\.0\.0\.1:7242\/ingest\//
];

function isAllowedFailedRequest(entry) {
  return ALLOWED_FAILED_REQUEST_PATTERNS.some((pattern) => pattern.test(entry.url));
}

test.describe('Smoke', () => {
  test('TC-SMOKE-01 首页基础壳层可加载', async ({ page }, testInfo) => {
    const pageErrors = [];
    const failedRequests = [];

    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    page.on('requestfailed', (request) => {
      failedRequests.push({
        url: request.url(),
        error: request.failure()?.errorText || 'requestfailed'
      });
    });

    page.on('response', (response) => {
      if (response.status() >= 400) {
        failedRequests.push({
          url: response.url(),
          error: `HTTP ${response.status()}`
        });
      }
    });

    await page.goto('/index.html', { waitUntil: 'load' });
    await waitForAppReady(page);

    await expect(page).toHaveTitle('排班系统 - Shift Scheduler');
    await expect(page.locator('#mainTitle')).toHaveText('排班结果展示');
    await expect(page.locator('#statusText')).toContainText('已切换到排班展示');
    await expect(page.locator('#scheduleTable')).toContainText('排班结果配置');
    await expect(page.locator('#scheduleTable')).toContainText('新建排班结果');
    await expect(page.locator('#scheduleTable')).toContainText('导入排班结果');
    await expect(page.locator('#btnSchedulePeriodView')).toBeVisible();
    await expect(page.locator('#btnGenerate')).toBeVisible();
    await expect(page.locator('#btnExport')).toBeVisible();
    await expect(page.locator('#progressBarContainer')).toBeHidden();

    const unexpectedFailures = failedRequests.filter((entry) => !isAllowedFailedRequest(entry));

    await testInfo.attach('smoke-page-errors.json', {
      body: JSON.stringify(pageErrors, null, 2),
      contentType: 'application/json'
    });

    await testInfo.attach('smoke-failed-requests.json', {
      body: JSON.stringify(failedRequests, null, 2),
      contentType: 'application/json'
    });

    expect(pageErrors).toEqual([]);
    expect(unexpectedFailures).toEqual([]);
  });
});
