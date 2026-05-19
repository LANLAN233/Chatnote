import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { TEST_USER } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '.auth', 'tester.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/login');

  // Login inputs have no name attributes — use type selectors
  await page.fill('input[type="text"]', TEST_USER.username);
  await page.fill('input[type="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');

  // After login, the app redirects to /
  await expect(page).toHaveURL('/', { timeout: 10000 });

  // Save auth state for dependent tests
  await page.context().storageState({ path: authFile });
});
