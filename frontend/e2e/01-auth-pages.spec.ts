import { test } from '@playwright/test';
import { screenshot } from './helpers';

test.describe('Auth Pages', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('01 - Login page empty', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '01-auth-login-page');
  });

  test('02 - Login page filled', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.fill('input[type="text"]', 'testerA');
    await page.fill('input[type="password"]', '123456');
    await screenshot(page, '02-auth-login-filled');
  });

  test('03 - Login page error', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.fill('input[type="text"]', 'wronguser');
    await page.fill('input[type="password"]', 'wrongpass');
    await page.click('button[type="submit"]');
    // Wait for error message to appear
    await page.waitForTimeout(1000);
    await screenshot(page, '03-auth-login-error');
  });

  test('04 - Register page empty', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '04-auth-register-page');
  });

  test('05 - Register page filled', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    // Register form: username (1st text input), display name (2nd text input), password
    await page.locator('input[type="text"]').nth(0).fill('newuser');
    await page.locator('input[type="text"]').nth(1).fill('New User');
    await page.fill('input[type="password"]', 'password123');
    // Do NOT submit — only capture the filled form
    await screenshot(page, '05-auth-register-filled');
  });
});
