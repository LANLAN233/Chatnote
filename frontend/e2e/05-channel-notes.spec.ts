import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { screenshot, screenshotElement } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '.auth', 'tester.json');

test.describe('Channel Notes', () => {
  test.use({ storageState: AUTH_FILE });

  test('30 - Channel view', async ({ page }) => {
    // Navigate to first server's channel list, click first non-General channel
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Click on 高等数学 server icon (first server)
    const serverIcons = page.locator('[class*="server-icon"], [class*="ServerIcon"], [class*="server"] button, nav button').first();
    if (await serverIcons.isVisible({ timeout: 3000 }).catch(() => false)) {
      await serverIcons.click();
      await page.waitForTimeout(500);
    }
    // Click "导数" channel
    const channel = page.getByRole('button', { name: '导数' }).or(page.locator('text=导数').first());
    if (await channel.isVisible({ timeout: 3000 }).catch(() => false)) {
      await channel.click();
      await page.waitForLoadState('networkidle');
    }
    await screenshot(page, '30-channel-view');
  });

  test('31 - Note list', async ({ page }) => {
    await navigateToChannel(page, '导数');
    await screenshot(page, '31-note-list');
  });

  test('32 - Note editor', async ({ page }) => {
    await navigateToChannel(page, '导数');
    // Focus the note input/textarea at bottom
    const editor = page.locator('textarea, [contenteditable="true"]').first();
    if (await editor.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editor.click();
      await editor.fill('测试笔记内容...');
    }
    await screenshot(page, '32-note-editor');
  });

  test('33 - @ autocomplete in editor', async ({ page }) => {
    await navigateToChannel(page, '导数');
    const editor = page.locator('textarea, [contenteditable="true"]').first();
    if (await editor.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editor.click();
      await editor.fill('@');
      await page.waitForTimeout(800);
    }
    await screenshot(page, '33-note-editor-at-autocomplete');
  });

  test('34 - # autocomplete in editor', async ({ page }) => {
    await navigateToChannel(page, '导数');
    const editor = page.locator('textarea, [contenteditable="true"]').first();
    if (await editor.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editor.click();
      await editor.fill('#');
      await page.waitForTimeout(800);
    }
    await screenshot(page, '34-note-editor-hash-autocomplete');
  });

  test('35 - Pinned panel', async ({ page }) => {
    await navigateToChannel(page, '导数');
    // Click Pins/Pinned button if visible
    const pinBtn = page.getByRole('button', { name: /pin|钉选|Pins/i });
    if (await pinBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pinBtn.click();
      await page.waitForTimeout(500);
    }
    await screenshot(page, '35-pinned-panel');
  });

  test('36 - Context menu', async ({ page }) => {
    await navigateToChannel(page, '导数');
    // Right-click on the first note
    const firstNote = page.locator('[class*="note"], [class*="message"], [class*="Note"]').first();
    if (await firstNote.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstNote.click({ button: 'right' });
      await page.waitForTimeout(500);
    }
    await screenshot(page, '36-note-context-menu');
    // Close context menu
    await page.keyboard.press('Escape');
  });

  test('37 - Inline edit', async ({ page }) => {
    await navigateToChannel(page, '导数');
    // Hover over first note to see action buttons
    const firstNote = page.locator('[class*="note"], [class*="message"], [class*="Note"]').first();
    if (await firstNote.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstNote.hover();
      await page.waitForTimeout(300);
      // Click Edit button
      const editBtn = page.getByRole('button', { name: /edit|编辑/i }).or(page.locator('button:has-text("编辑")'));
      if (await editBtn.first().isVisible({ timeout: 1000 }).catch(() => false)) {
        await editBtn.first().click();
        await page.waitForTimeout(300);
      }
    }
    await screenshot(page, '37-note-inline-edit');
    await page.keyboard.press('Escape');
  });

  test('38 - Thread panel', async ({ page }) => {
    await navigateToChannel(page, '导数');
    // Right-click note, click "Create Thread"
    const firstNote = page.locator('[class*="note"], [class*="message"]').first();
    if (await firstNote.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstNote.click({ button: 'right' });
      await page.waitForTimeout(300);
      const threadBtn = page.getByRole('menuitem', { name: /thread|讨论串|创建讨论/i }).or(page.locator('text=Create Thread'));
      if (await threadBtn.first().isVisible({ timeout: 1000 }).catch(() => false)) {
        await threadBtn.first().click();
        await page.waitForTimeout(1000);
      } else {
        await page.keyboard.press('Escape');
      }
    }
    await screenshot(page, '38-thread-panel');
  });

  test('39 - User tags on note', async ({ page }) => {
    await navigateToChannel(page, '导数');
    // Look for a note with tags (seeded with tags like ["重点"])
    await screenshot(page, '39-note-user-tags');
  });

  test('40 - Note with attachments', async ({ page }) => {
    await navigateToChannel(page, '导数');
    // Navigate to server files or find attachment icon
    const attachBtn = page.locator('[class*="attach"], [class*="file"], input[type="file"]').first();
    if (await attachBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await screenshotElement(page, '[class*="attach"], [class*="file"]', '40-note-attachments');
    } else {
      await screenshot(page, '40-note-attachments');
    }
  });
});

/** Helper: navigate to a specific channel */
async function navigateToChannel(page: import('@playwright/test').Page, channelName: string) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Click first server icon
  const serverIcons = page.locator('nav button, [class*="server-icon"], [class*="ServerIcon"]').first();
  if (await serverIcons.isVisible({ timeout: 3000 }).catch(() => false)) {
    await serverIcons.click();
    await page.waitForTimeout(500);
  }
  // Click channel by name
  const channel = page.getByRole('button', { name: channelName }).or(page.locator(`text=${channelName}`).first());
  if (await channel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await channel.click();
    await page.waitForLoadState('networkidle');
  }
}
