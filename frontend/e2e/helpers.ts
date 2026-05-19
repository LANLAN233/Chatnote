import type { Page, APIRequestContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

/** Standard test user credentials */
export const TEST_USER = {
  username: 'testerA',
  password: '123456',
};

/** Pre-built server/channel hierarchy for seeding */
export const SERVERS = [
  {
    name: '高等数学',
    channels: ['导数', '极限', '积分', '微分方程', '级数'],
  },
  {
    name: '大学英语',
    channels: ['听力', '阅读', '写作', '翻译', '口语'],
  },
  {
    name: '数据结构',
    channels: ['数组', '链表', '树', '图', '排序'],
  },
];

/** LLM provider API keys (server-side encrypted, used here for test seeding) */
export const API_KEYS = [
  { provider: 'moonshot', key: 'REDACTED' },
  { provider: 'opencode', key: 'REDACTED' },
  { provider: 'deepseek', key: 'REDACTED' },
];

/**
 * Take a full-page screenshot and save to e2e/screenshots/.
 * Returns the absolute file path.
 */
export async function screenshot(page: Page, name: string): Promise<string> {
  const filePath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

/**
 * Take an element screenshot for a given selector.
 * Returns the absolute file path.
 */
export async function screenshotElement(
  page: Page,
  selector: string,
  name: string,
): Promise<string> {
  const filePath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  const el = page.locator(selector).first();
  await el.screenshot({ path: filePath });
  return filePath;
}

/**
 * Seed test data via the backend API.
 * Stub — will be expanded in Task 2.
 */
export async function seedData(request: APIRequestContext): Promise<void> {
  console.log('[seedData] seeding test data (stub — will be implemented in Task 2)');
  // TODO: POST SERVERS + channels + API_KEYS via backend REST API
  void request; // suppress unused warning
}
