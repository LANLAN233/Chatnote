import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { screenshot, screenshotElement } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '.auth', 'tester.json');

test.describe('Home Tabs', () => {
  test.use({ storageState: AUTH_FILE });

  /** Helper: navigate home and click a sidebar tab */
  async function goToTab(page: import('@playwright/test').Page, tabName: string) {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const tab = page.getByRole('button', { name: tabName });
    if (
      await tab
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await tab.click();
      await page.waitForTimeout(500);
    }
  }

  test('15 - Inbox tab', async ({ page }) => {
    await goToTab(page, '待分类');
    await screenshot(page, '15-inbox-items');
  });

  test('16 - Inbox AI suggest', async ({ page }) => {
    const SKIP_AI = process.env.SKIP_AI_TESTS;
    test.skip(!!SKIP_AI, 'SKIP_AI_TESTS is set');

    await goToTab(page, '待分类');

    // Click expand on first inbox item if exists
    const firstItem = page
      .locator('[class*="inbox-item"], [class*="InboxItem"]')
      .first();
    if (
      await firstItem
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await firstItem.click();

      // Try AI suggest button (Sparkles icon or "AI" button)
      const aiBtn = page
        .getByRole('button', { name: /AI|suggest|建议/ })
        .or(page.locator('[class*="sparkles"], [class*="Sparkles"]'));
      if (
        await aiBtn
          .first()
          .isVisible({ timeout: 2000 })
          .catch(() => false)
      ) {
        await aiBtn.first().click();
        await page.waitForTimeout(2000);
      }
    }

    await screenshot(page, '16-inbox-ai-suggest');
  });

  test('17 - Inbox archive dialog', async ({ page }) => {
    await goToTab(page, '待分类');

    // Click archive button on an inbox item
    const archiveBtn = page
      .getByRole('button', { name: /archive|归档/ })
      .or(page.locator('button:has-text("归档")'));
    if (
      await archiveBtn
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false)
    ) {
      await archiveBtn.first().click();
      await page.waitForTimeout(500);
    }

    await screenshot(page, '17-inbox-archive-dialog');

    // Close dialog
    await page.keyboard.press('Escape');
  });

  test('18 - Recent activity', async ({ page }) => {
    await goToTab(page, '最近活动');
    await screenshot(page, '18-recent-activity');
  });

  test('19 - Console view', async ({ page }) => {
    await goToTab(page, '总控制台');
    await screenshot(page, '19-console-view');
  });

  test('20 - Console session panel', async ({ page }) => {
    await goToTab(page, '总控制台');

    // Session panel is typically on the left side of console
    const sessionPanel = page
      .locator('[class*="session"], [class*="Session"], [class*="conversation"]')
      .first();
    if (
      await sessionPanel
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await screenshotElement(
        page,
        '[class*="session"], [class*="Session"], [class*="conversation"]',
        '20-console-session-panel',
      );
    } else {
      await screenshot(page, '20-console-session-panel');
    }
  });

  test('21 - Console autocomplete', async ({ page }) => {
    await goToTab(page, '总控制台');

    // Type @ to trigger autocomplete
    const input = page
      .locator('textarea, [contenteditable="true"], [class*="input"]')
      .first();
    if (
      await input
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await input.click();
      await input.fill('@');
      await page.waitForTimeout(800);
    }

    await screenshot(page, '21-console-autocomplete');
  });

  test('22 - Console /help command', async ({ page }) => {
    await goToTab(page, '总控制台');

    const input = page.locator('textarea, [contenteditable="true"]').first();
    if (
      await input
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await input.fill('/help');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
    }

    await screenshot(page, '22-console-help-command');
  });
});
