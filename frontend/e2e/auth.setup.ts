import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '.auth', 'user.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/login');

  // Login inputs have no name attributes — use type selectors
  await page.fill('input[type="text"]', 'ai_tester');
  await page.fill('input[type="password"]', 'test123456');
  await page.click('button[type="submit"]');

  // After login, the app redirects to /
  await expect(page).toHaveURL('/', { timeout: 10000 });

  // Save auth state for dependent tests
  await page.context().storageState({ path: authFile });
});
