import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE = path.join(__dirname, '..', '..', 'test_img', 'timetable1.png');
const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');

test.describe('Schedule Image Import E2E', () => {
  // Backend Kimi vision call has 300s timeout; full flow needs ~300s.
  test.describe.configure({ mode: 'serial', timeout: 360000 });

  // All tests share the same authenticated state
  test.use({ storageState: AUTH_FILE });

  /**
   * Helper: navigate to home and click the schedule import tab.
   * Returns once the ScheduleImportPanel is visible.
   */
  async function goToScheduleImport(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click "日程表导入" tab in the left sidebar (HomeSidebar)
    const importTab = page.getByRole('button', { name: '日程表导入' });
    await importTab.click();

    // Wait for the panel header to appear
    await expect(page.getByRole('heading', { name: '日程表导入' })).toBeVisible({ timeout: 5000 });
  }

  test('Scenario 1: Drag image → AI parse → display results', async ({ page }) => {
    // Backend Kimi vision call has 300s timeout; full flow needs ~300s.
    test.setTimeout(360000);

    await goToScheduleImport(page);

    // Upload image via the hidden file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_IMAGE);

    // Verify the image preview appeared
    await expect(page.locator('img[alt="Preview"]')).toBeVisible({ timeout: 5000 });

    // Click the AI parse button
    const parseBtn = page.getByRole('button', { name: /AI 解析并生成建议/ });
    await parseBtn.click();

    // Wait for parse results (up to 310s for AI response + buffering)
    const resultsHeader = page.getByRole('heading', { name: '解析结果预览' });
    await expect(resultsHeader).toBeVisible({ timeout: 310000 });

    // Verify we have either server entries or schedule entries (or both)
    const serverEntries = page.locator('span:has-text("@")').first();
    const scheduleCards = page.locator('input[type="time"]');

    const serverCount = await serverEntries.count();
    const scheduleCount = await scheduleCards.count();

    // At minimum, the user should see some AI-parsed content
    expect(serverCount + scheduleCount).toBeGreaterThan(0);
  });

  test('Scenario 2: Parse → edit → confirm create', async ({ page }) => {
    // Backend Kimi vision call has 300s timeout; full flow needs ~300s.
    test.setTimeout(360000);

    await goToScheduleImport(page);

    // Upload image
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_IMAGE);
    await expect(page.locator('img[alt="Preview"]')).toBeVisible({ timeout: 5000 });

    // Click parse
    const parseBtn = page.getByRole('button', { name: /AI 解析并生成建议/ });
    await parseBtn.click();

    // Wait for results (up to 310s for AI response + buffering)
    const resultsHeader = page.getByRole('heading', { name: '解析结果预览' });
    await expect(resultsHeader).toBeVisible({ timeout: 310000 });

    // Debug: log parsed content counts before creating
    const serverEntries = page.locator('span:has-text("@")');
    const scheduleCards = page.locator('input[type="time"]');
    const serverCount = await serverEntries.count();
    const scheduleCount = await scheduleCards.count();
    console.log(`[E2E] Parsed: ${serverCount} servers, ${scheduleCount} schedules`);

    // Verify the create button is visible and click it
    const createBtn = page.getByRole('button', { name: '确认创建' });
    await expect(createBtn).toBeVisible({ timeout: 5000 });
    await createBtn.click();

    // The button text changes to "创建中..." while creating
    await expect(page.getByRole('button', { name: /创建中/ })).toBeVisible({ timeout: 5000 });

    // Wait for the success banner — "导入成功！" heading
    const successHeading = page.getByRole('heading', { name: '导入成功！' });
    await expect(successHeading).toBeVisible({ timeout: 30000 });

    // Verify the success message includes counts (e.g. "创建了 X 个服务器")
    const successText = page.locator('text=/创建了 \\d+ 个服务器/');
    await expect(successText).toBeVisible({ timeout: 5000 });
  });

  test('Scenario 3: Text-only parse (regression)', async ({ page }) => {
    test.setTimeout(60000);

    await goToScheduleImport(page);

    // Type schedule text into the textarea
    const textarea = page.locator('textarea');
    await textarea.fill('高等数学I 周一 8:00-9:35\n第一章 函数与极限\n第二章 导数与微分');
    await page.waitForTimeout(500);

    // Click parse
    const parseBtn = page.getByRole('button', { name: /AI 解析并生成建议/ });
    await parseBtn.click();

    // Wait for results
    const resultsHeader = page.getByRole('heading', { name: '解析结果预览' });
    await expect(resultsHeader).toBeVisible({ timeout: 60000 });

    // Verify non-empty result — we should see server items or schedule items
    const anyContent = page.locator('text=@').or(page.locator('input[type="time"]')).first();
    await expect(anyContent).toBeVisible({ timeout: 5000 });
  });
});
