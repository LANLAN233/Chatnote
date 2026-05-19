import { test } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { screenshot, screenshotElement } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '.auth', 'tester.json');

test.describe('Home Overview', () => {
  test.use({ storageState: AUTH_FILE });

  test('06 - Home overview', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '06-home-overview');
  });

  test('07 - Stats cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Three stat cards (Total Notes / Study Streak / Inbox) inside a section element
    const selector = 'section:has-text("Total Notes")';
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshotElement(page, selector, '07-home-stats-cards');
    } else {
      await screenshot(page, '07-home-stats-cards');
    }
  });

  test('08 - Server distribution', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Server distribution panel with heading "伺服器分布"
    const selector = 'div:has-text("伺服器分布")';
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshotElement(page, selector, '08-home-server-distribution');
    } else {
      await screenshot(page, '08-home-server-distribution');
    }
  });

  test('09 - Quick capture / SmartInput', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // SmartInput area with heading "快速控制台" and Zap icon
    const selector = 'div:has(h3:has-text("快速控制台"))';
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshotElement(page, selector, '09-home-quick-capture');
    } else {
      await screenshot(page, '09-home-quick-capture');
    }
  });

  test('10 - Upcoming today', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // "Upcoming Today" section with schedule items in the right sidebar
    // Target the heading plus its adjacent container, or the ancestor section
    const selector = 'div:has(> h3:has-text("Upcoming Today"))';
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshotElement(page, selector, '10-home-upcoming-today');
    } else {
      await screenshot(page, '10-home-upcoming-today');
    }
  });

  test('11 - Top tags', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Top tags panel with heading "热门标签"
    const selector = 'div:has-text("热门标签")';
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshotElement(page, selector, '11-home-top-tags');
    } else {
      await screenshot(page, '11-home-top-tags');
    }
  });

  test('12 - Sidebar home', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Left 72px sidebar with server icons (Home button + server list)
    // Sidebar is the first narrow fixed-width div in the layout flex container
    const selector = 'nav, aside, div[class*="w-[72px]"]';
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshotElement(page, selector, '12-sidebar-home');
    } else {
      await screenshot(page, '12-sidebar-home');
    }
  });

  test('13 - Home sidebar tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // HomeSidebar: 240px panel with tab buttons (概要, 每日总结, 待分类, etc.)
    const selector = 'div:has(button:has-text("概要"))';
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshotElement(page, selector, '13-home-sidebar-tabs');
    } else {
      await screenshot(page, '13-home-sidebar-tabs');
    }
  });

  test('14 - Search modal (Ctrl+K)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(800);
    // Search modal: fixed overlay with backdrop blur, appears on Ctrl+K
    const selector = '[class*="fixed"][class*="inset-0"][class*="z-50"]';
    const el = page.locator(selector).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshotElement(page, selector, '14-search-modal');
    } else {
      await screenshot(page, '14-search-modal');
    }
  });
});
