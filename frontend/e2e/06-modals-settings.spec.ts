import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { screenshot } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '.auth', 'tester.json');

test.describe('Modals & Settings', () => {
  test.use({ storageState: AUTH_FILE });

  test('41 - Server create modal', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Click "+" button in sidebar to create server
    const addBtn = page.locator('button:has-text("+")').or(page.getByRole('button', { name: /add server|添加服务器|新建/i }));
    if (await addBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await addBtn.first().click();
      await page.waitForTimeout(500);
    }
    await screenshot(page, '41-server-create-modal');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('42 - Server edit modal', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Right-click a server icon
    const serverIcon = page.locator('[class*="server"], nav button').first();
    if (await serverIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
      await serverIcon.click({ button: 'right' });
      await page.waitForTimeout(300);
      const editBtn = page.getByRole('menuitem', { name: /edit|编辑|修改/i }).or(page.locator('text=Edit'));
      if (await editBtn.first().isVisible({ timeout: 1000 }).catch(() => false)) {
        await editBtn.first().click();
        await page.waitForTimeout(300);
      }
    }
    await screenshot(page, '42-server-edit-modal');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('43 - Channel create modal', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Click first server, then find "Add Channel" button
    const serverIcon = page.locator('nav button').first();
    if (await serverIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
      await serverIcon.click();
      await page.waitForTimeout(500);
    }
    const addChBtn = page.getByRole('button', { name: /添加频道|add channel|新建频道/i }).or(page.locator('button:has-text("+")'));
    if (await addChBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await addChBtn.first().click();
      await page.waitForTimeout(300);
    }
    await screenshot(page, '43-channel-create-modal');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('44 - Channel edit modal', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Click first server
    const serverIcon = page.locator('nav button').first();
    if (await serverIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
      await serverIcon.click();
      await page.waitForTimeout(500);
    }
    // Right-click a channel
    const channelItem = page.locator('[class*="channel"]').first();
    if (await channelItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await channelItem.click({ button: 'right' });
      await page.waitForTimeout(300);
      const editBtn = page.getByRole('menuitem', { name: /edit|编辑|修改/i });
      if (await editBtn.first().isVisible({ timeout: 1000 }).catch(() => false)) {
        await editBtn.first().click();
        await page.waitForTimeout(300);
      }
    }
    await screenshot(page, '44-channel-edit-modal');
    await page.keyboard.press('Escape');
  });

  // Settings tabs (45-51)
  for (const [num, tabName, file] of [
    [45, 'Account', '45-settings-account'],
    [46, 'Profile', '46-settings-profile'],
    [47, 'AI', '47-settings-ai-preferences'],
    [48, 'API', '48-settings-api-keys'],
    [49, 'Appearance', '49-settings-appearance'],
    [50, 'Notifications', '50-settings-notifications'],
    [51, 'Export', '51-settings-export'],
  ] as const) {
    test(`${num} - Settings ${tabName}`, async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      // Open settings (gear icon or user avatar)
      const settingsBtn = page.locator('[class*="settings"], [class*="Settings"], button:has-text("设置")').first();
      if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await settingsBtn.click();
        await page.waitForTimeout(500);
      } else {
        // Try user avatar button
        const avatarBtn = page.locator('[class*="avatar"], [class*="user"]').last();
        if (await avatarBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await avatarBtn.click();
          await page.waitForTimeout(500);
        }
      }
      // Click the tab
      const tab = page.getByRole('tab', { name: tabName }).or(page.getByRole('button', { name: tabName }));
      if (await tab.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await tab.first().click();
        await page.waitForTimeout(300);
      }
      await screenshot(page, file);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    });
  }

  test('52 - Server files modal', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Click first server
    const serverIcon = page.locator('nav button').first();
    if (await serverIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
      await serverIcon.click();
      await page.waitForTimeout(500);
    }
    // Click "Library" or "Resources" button
    const libraryBtn = page.getByRole('button', { name: /library|资源|文件|Library|Files/i });
    if (await libraryBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await libraryBtn.first().click();
      await page.waitForTimeout(500);
    } else {
      // Try "Resources" section
      const resourcesBtn = page.locator('text=Resources').or(page.locator('text=资源'));
      if (await resourcesBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await resourcesBtn.first().click();
        await page.waitForTimeout(500);
      }
    }
    await screenshot(page, '52-server-files-modal');
  });

  test('53 - Server files upload', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const serverIcon = page.locator('nav button').first();
    if (await serverIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
      await serverIcon.click();
      await page.waitForTimeout(500);
    }
    const libraryBtn = page.getByRole('button', { name: /library|资源|文件/i });
    if (await libraryBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await libraryBtn.first().click();
      await page.waitForTimeout(500);
    }
    // Click upload button
    const uploadBtn = page.locator('button:has-text("上传")').or(page.getByRole('button', { name: /upload|上传/i }));
    if (await uploadBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      await uploadBtn.first().click();
      await page.waitForTimeout(300);
    }
    await screenshot(page, '53-server-files-upload');
    await page.keyboard.press('Escape');
  });
});
