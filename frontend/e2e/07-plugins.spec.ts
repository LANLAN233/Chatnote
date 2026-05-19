import { test } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { screenshot } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '.auth', 'tester.json');

test.describe('Plugin Manager', () => {
  test.use({ storageState: AUTH_FILE });

  test('54 - Plugin manager', async ({ page }) => {
    await page.goto('/plugins');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '54-plugin-manager');
  });

  test('55 - Plugin config', async ({ page }) => {
    await page.goto('/plugins');
    await page.waitForLoadState('networkidle');
    // Click settings/config icon on first plugin
    const configBtn = page.locator('button:has-text("设置")').or(page.getByRole('button', { name: /config|设置|配置/i }));
    if (await configBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await configBtn.first().click();
      await page.waitForTimeout(500);
    }
    await screenshot(page, '55-plugin-config');
    await page.keyboard.press('Escape');
  });

  test('56 - Plugin dev console', async ({ page }) => {
    await page.goto('/plugins');
    await page.waitForLoadState('networkidle');
    // Click dev console tab or button
    const devBtn = page.getByRole('button', { name: /dev|开发|控制台|console/i }).or(page.locator('text=Dev Console'));
    if (await devBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await devBtn.first().click();
      await page.waitForTimeout(500);
    }
    await screenshot(page, '56-plugin-dev-console');
  });

  test('57 - Plugin toggle', async ({ page }) => {
    await page.goto('/plugins');
    await page.waitForLoadState('networkidle');
    // Toggle switch for first plugin — capture state, don't flip it
    await screenshot(page, '57-plugin-toggle');
  });
});
