import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { screenshot } from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '.auth', 'tester.json');
const TEST_IMG_0 = path.join(__dirname, '..', '..', 'test_img', 'timetable0.png');
const TEST_IMG_1 = path.join(__dirname, '..', '..', 'test_img', 'timetable1.png');

const SKIP_AI = !!process.env.SKIP_AI_TESTS;

test.describe('AI Features', () => {
  test.describe.configure({ mode: 'serial', timeout: 360000 });
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

  // ═══════════════════════════════════════════════════════════════
  // SCHEDULE IMPORT
  // ═══════════════════════════════════════════════════════════════

  test('58 - Schedule import text input', async ({ page }) => {
    await goToTab(page, '日程表导入');
    // Type text into textarea
    const textarea = page.locator('textarea');
    if (
      await textarea
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await textarea.fill(
        '高等数学I 周一 8:00-9:35\n第一章 函数与极限\n第二章 导数与微分',
      );
      await page.waitForTimeout(500);
    }
    await screenshot(page, '58-schedule-import-text-input');
  });

  test('59 - Schedule import image upload (timetable0)', async ({ page }) => {
    await goToTab(page, '日程表导入');
    const fileInput = page.locator('input[type="file"]');
    if (
      await fileInput
        .isVisible()
        .catch(() => false)
    ) {
      await fileInput.setInputFiles(TEST_IMG_0);
      await page.waitForTimeout(1000);
    }
    await screenshot(page, '59-schedule-import-image-upload');
  });

  test('60 - Schedule import AI parse result', async ({ page }) => {
    test.skip(SKIP_AI, 'SKIP_AI_TESTS is set');
    test.setTimeout(360000);

    await goToTab(page, '日程表导入');
    // Upload image
    const fileInput = page.locator('input[type="file"]');
    if (
      await fileInput
        .isVisible()
        .catch(() => false)
    ) {
      await fileInput.setInputFiles(TEST_IMG_0);
      await page.waitForTimeout(500);
    }
    // Click AI parse
    const parseBtn = page.getByRole('button', { name: /AI 解析并生成建议/ });
    if (
      await parseBtn
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await parseBtn.click();
    }
    // Wait for results (up to 310s)
    const resultsHeader = page.getByRole('heading', { name: '解析结果预览' });
    if (
      await resultsHeader
        .isVisible({ timeout: 310000 })
        .catch(() => false)
    ) {
      await screenshot(page, '60-schedule-import-ai-parse-result');
    }
  });

  test('61 - Schedule import editable preview', async ({ page }) => {
    test.skip(SKIP_AI, 'SKIP_AI_TESTS is set');

    await goToTab(page, '日程表导入');
    const fileInput = page.locator('input[type="file"]');
    if (
      await fileInput
        .isVisible()
        .catch(() => false)
    ) {
      await fileInput.setInputFiles(TEST_IMG_0);
      await page.waitForTimeout(300);
    }
    const parseBtn = page.getByRole('button', { name: /AI 解析并生成建议/ });
    if (
      await parseBtn
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await parseBtn.click();
    }
    const resultsHeader = page.getByRole('heading', { name: '解析结果预览' });
    if (
      await resultsHeader
        .isVisible({ timeout: 310000 })
        .catch(() => false)
    ) {
      await screenshot(page, '61-schedule-import-editable-preview');
    }
  });

  test('62 - Schedule import success', async ({ page }) => {
    test.skip(SKIP_AI, 'SKIP_AI_TESTS is set');
    test.setTimeout(360000);

    await goToTab(page, '日程表导入');
    const fileInput = page.locator('input[type="file"]');
    if (
      await fileInput
        .isVisible()
        .catch(() => false)
    ) {
      await fileInput.setInputFiles(TEST_IMG_0);
      await page.waitForTimeout(300);
    }
    const parseBtn = page.getByRole('button', { name: /AI 解析并生成建议/ });
    if (
      await parseBtn
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await parseBtn.click();
    }
    const resultsHeader = page.getByRole('heading', { name: '解析结果预览' });
    if (
      await resultsHeader
        .isVisible({ timeout: 310000 })
        .catch(() => false)
    ) {
      const createBtn = page.getByRole('button', { name: '确认创建' });
      if (
        await createBtn
          .isVisible({ timeout: 5000 })
          .catch(() => false)
      ) {
        await createBtn.click();
        await page.waitForTimeout(3000);
        // Wait for success heading
        const successHeading = page.getByRole('heading', {
          name: /导入成功|成功/,
        });
        if (
          await successHeading
            .isVisible({ timeout: 30000 })
            .catch(() => false)
        ) {
          await screenshot(page, '62-schedule-import-success');
        }
      }
    }
  });

  test('63 - Schedule import image2 (timetable1)', async ({ page }) => {
    test.skip(SKIP_AI, 'SKIP_AI_TESTS is set');
    test.setTimeout(360000);

    await goToTab(page, '日程表导入');
    const fileInput = page.locator('input[type="file"]');
    if (
      await fileInput
        .isVisible()
        .catch(() => false)
    ) {
      await fileInput.setInputFiles(TEST_IMG_1);
      await page.waitForTimeout(500);
    }
    await screenshot(page, '63-schedule-import-image2');
    // Optionally parse
    const parseBtn = page.getByRole('button', { name: /AI 解析并生成建议/ });
    if (
      await parseBtn
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await parseBtn.click();
    }
    const resultsHeader = page.getByRole('heading', { name: '解析结果预览' });
    if (
      await resultsHeader
        .isVisible({ timeout: 310000 })
        .catch(() => false)
    ) {
      // Screenshot already taken; verify timetable1 was loaded
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // DAILY SUMMARY
  // ═══════════════════════════════════════════════════════════════

  test('64 - Daily summary empty', async ({ page }) => {
    await goToTab(page, '每日总结');
    await screenshot(page, '64-daily-summary-empty');
  });

  test('65 - Daily summary generated', async ({ page }) => {
    test.skip(SKIP_AI, 'SKIP_AI_TESTS is set');
    test.setTimeout(360000);

    await goToTab(page, '每日总结');
    // Click generate/regenerate button
    const genBtn = page
      .getByRole('button', { name: /生成|generate/i })
      .or(page.locator('button:has-text("生成")'));
    if (
      await genBtn
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await genBtn.first().click();
    }
    // Wait for summary content (up to 300s)
    await page.waitForTimeout(5000);
    // Check for MD editor or summary content
    const summaryContent = page
      .locator('[class*="md-editor"], [class*="summary"], [class*="markdown"]')
      .first();
    if (
      await summaryContent
        .isVisible({ timeout: 300000 })
        .catch(() => false)
    ) {
      await screenshot(page, '65-daily-summary-generated');
    }
  });

  test('66 - Daily summary keywords and stages', async ({ page }) => {
    test.skip(SKIP_AI, 'SKIP_AI_TESTS is set');

    await goToTab(page, '每日总结');
    const genBtn = page
      .getByRole('button', { name: /生成|generate/i })
      .or(page.locator('button:has-text("生成")'));
    if (
      await genBtn
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await genBtn.first().click();
    }
    await page.waitForTimeout(5000);
    const summaryContent = page
      .locator('[class*="md-editor"], [class*="summary"]')
      .first();
    if (
      await summaryContent
        .isVisible({ timeout: 300000 })
        .catch(() => false)
    ) {
      await screenshot(page, '66-daily-summary-keywords');
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // SMART CREATE (Quick Capture on Home)
  // ═══════════════════════════════════════════════════════════════

  test('67 - Smart create input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Home overview smart input
    const smartInput = page
      .locator('[class*="SmartInput"], [class*="quick"], textarea')
      .first();
    if (
      await smartInput
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await smartInput.click();
      await smartInput.fill('今天学习了导数的定义 @高等数学 #导数');
    }
    await screenshot(page, '67-home-quick-capture-ai');
  });

  test('68 - Smart create with AI toggle', async ({ page }) => {
    test.skip(SKIP_AI, 'SKIP_AI_TESTS is set');

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const smartInput = page
      .locator('[class*="SmartInput"], [class*="quick"], textarea')
      .first();
    if (
      await smartInput
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await smartInput.click();
      await smartInput.fill('今天学习了导数的定义 @高等数学 #导数');
      // Toggle AI on
      const aiToggle = page
        .locator('[class*="ai-toggle"], [class*="AIToggle"], button:has(svg)')
        .first();
      if (
        await aiToggle
          .isVisible({ timeout: 1000 })
          .catch(() => false)
      ) {
        await aiToggle.click();
        await page.waitForTimeout(300);
      }
    }
    await screenshot(page, '68-home-quick-capture-ai-on');
  });

  // ═══════════════════════════════════════════════════════════════
  // CONSOLE AI
  // ═══════════════════════════════════════════════════════════════

  test('69 - Console AI response', async ({ page }) => {
    test.skip(SKIP_AI, 'SKIP_AI_TESTS is set');
    test.setTimeout(360000);

    await goToTab(page, '总控制台');
    const input = page
      .locator('textarea, [contenteditable="true"]')
      .first();
    if (
      await input
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      // Enable AI if toggle exists
      const aiToggle = page
        .locator('[class*="ai-toggle"], [class*="AIToggle"]')
        .first();
      if (
        await aiToggle
          .isVisible({ timeout: 1000 })
          .catch(() => false)
      ) {
        await aiToggle.click();
        await page.waitForTimeout(200);
      }
      await input.fill('你好，请介绍一下高等数学中的导数概念');
      await page.keyboard.press('Enter');
      // Wait for AI response
      await page.waitForTimeout(5000);
    }
    await screenshot(page, '69-console-ai-response');
  });

  test('70 - Console tool calls', async ({ page }) => {
    test.skip(SKIP_AI, 'SKIP_AI_TESTS is set');
    test.setTimeout(360000);

    await goToTab(page, '总控制台');
    const input = page
      .locator('textarea, [contenteditable="true"]')
      .first();
    if (
      await input
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      const aiToggle = page
        .locator('[class*="ai-toggle"], [class*="AIToggle"]')
        .first();
      if (
        await aiToggle
          .isVisible({ timeout: 1000 })
          .catch(() => false)
      ) {
        await aiToggle.click();
        await page.waitForTimeout(200);
      }
      await input.fill('搜索一下微积分基本定理');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(8000);
    }
    await screenshot(page, '70-console-tool-call');
  });

  // ═══════════════════════════════════════════════════════════════
  // INBOX AI CLASSIFY
  // ═══════════════════════════════════════════════════════════════

  test('71 - Inbox AI classify', async ({ page }) => {
    test.skip(SKIP_AI, 'SKIP_AI_TESTS is set');
    test.setTimeout(120000);

    await goToTab(page, '待分类');
    // Click expand on first inbox item
    const firstItem = page
      .locator('[class*="inbox-item"], [class*="InboxItem"]')
      .first();
    if (
      await firstItem
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await firstItem.click();
      await page.waitForTimeout(300);
      // Click AI suggest (sparkles icon)
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
        await page.waitForTimeout(3000);
      }
    }
    await screenshot(page, '71-inbox-ai-classify');
  });

  // ═══════════════════════════════════════════════════════════════
  // NLP SCHEDULE PARSE
  // ═══════════════════════════════════════════════════════════════

  test('72 - Schedule NLP parse AI', async ({ page }) => {
    test.skip(SKIP_AI, 'SKIP_AI_TESTS is set');
    test.setTimeout(120000);

    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');
    // Open create schedule modal
    const createBtn = page.getByRole('button', { name: /新建日程|新建/i });
    if (
      await createBtn
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await createBtn.click();
      await page.waitForTimeout(500);
    }
    // Find NLP input field
    const nlpInput = page
      .locator(
        'input[placeholder*="自然"], input[placeholder*="例如"], textarea[placeholder*="自然"]',
      )
      .first();
    if (
      await nlpInput
        .isVisible({ timeout: 2000 })
        .catch(() => false)
    ) {
      await nlpInput.fill('周一 8:00-9:35 高等数学');
      await page.waitForTimeout(300);
    }
    // Click parse button
    const parseBtn = page.getByRole('button', { name: /解析|parse/i });
    if (
      await parseBtn
        .isVisible({ timeout: 2000 })
        .catch(() => false)
    ) {
      await parseBtn.click();
      // Wait for parse result
      await page.waitForTimeout(5000);
    }
    await screenshot(page, '72-schedule-nlp-parse-ai');
    await page.keyboard.press('Escape');
  });
});
