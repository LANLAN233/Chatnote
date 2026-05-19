import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TEST_USER, SERVERS, API_KEYS } from './helpers';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '.auth', 'tester.json');
const DATA_FILE = path.join(__dirname, 'seeded-data.json');

/** Descriptions for each server (not in helpers.ts SERVERS constant) */
const SERVER_DESCRIPTIONS: Record<string, string> = {
  '高等数学': '高等数学课程笔记',
  '大学英语': '大学英语课程笔记',
  '数据结构': '数据结构课程笔记',
};

/** Notes content — at least 15 notes spread across ≥7 channels */
const NOTES_CONTENT: {
  serverIdx: number;
  channelName: string;
  content: string;
  tags?: string[];
}[] = [
  // 高等数学 > 导数 (3 notes)
  { serverIdx: 0, channelName: '导数', content: '今天学习了导数的基本概念，包括导数的定义和几何意义' },
  { serverIdx: 0, channelName: '导数', content: '## 极限与连续\n\n利用ε-δ语言证明极限...' },
  { serverIdx: 0, channelName: '导数', content: '求函数 f(x)=x²+3x-1 在 x=2 处的导数', tags: ['重点', '待复习'] },
  // 高等数学 > 极限 (3 notes)
  { serverIdx: 0, channelName: '极限', content: '极限的ε-δ定义详解' },
  { serverIdx: 0, channelName: '极限', content: '数列极限的判定方法', tags: ['重点', '待复习'] },
  { serverIdx: 0, channelName: '极限', content: '## 极限运算法则\n\n1. 和差积商的极限\n2. 复合函数的极限' },
  // 高等数学 > 积分 (2 notes)
  { serverIdx: 0, channelName: '积分', content: '不定积分的基本公式总结' },
  { serverIdx: 0, channelName: '积分', content: '## 定积分\n\n```\n∫ₐᵇ f(x)dx\n```' },
  // 大学英语 > 听力 (2 notes)
  { serverIdx: 1, channelName: '听力', content: 'Unit 3 Listening Comprehension notes' },
  { serverIdx: 1, channelName: '听力', content: 'IELTS听力技巧整理' },
  // 大学英语 > 写作 (2 notes)
  { serverIdx: 1, channelName: '写作', content: '学术写作常见句型' },
  { serverIdx: 1, channelName: '写作', content: 'Essay structure: Introduction-Body-Conclusion' },
  // 数据结构 > 树 (3 notes)
  { serverIdx: 2, channelName: '树', content: '二叉树的遍历：前序、中序、后序' },
  { serverIdx: 2, channelName: '树', content: 'AVL树旋转操作总结', tags: ['重点'] },
  { serverIdx: 2, channelName: '树', content: '## 红黑树性质\n\n1. 每个节点是红色或黑色\n2. 根节点是黑色\n3. 红色节点的子节点必须是黑色', tags: ['错题'] },
  // 数据结构 > 排序 (2 notes)
  { serverIdx: 2, channelName: '排序', content: '快排 vs 归并排序时间复杂度对比' },
  { serverIdx: 2, channelName: '排序', content: '排序算法稳定性一览' },
  // 高等数学 > 微分方程 (1 note)
  { serverIdx: 0, channelName: '微分方程', content: '## 一阶线性微分方程\n\n标准形式: dy/dx + P(x)y = Q(x)' },
];

/** Inbox items to create */
const INBOX_ITEMS = [
  '微积分第三章课后习题答案需要整理',
  '英语四级听力真题2019年',
  '红黑树的插入删除操作图解',
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

interface SeededData {
  servers: { id: number; name: string; primary_channel_id: number | null }[];
  channels: { id: number; name: string; server_id: number }[];
  notes: { id: number; content: string }[];
  schedules: { id: number; title: string }[];
  inbox: { id: number; content: string }[];
  apiKeys: { id: number; provider: string }[];
  token: string;
}

// ─────────────────────────────────────────────────────────────
// Main Setup
// ─────────────────────────────────────────────────────────────

setup('seed test data', async ({ request }) => {
  const seeded: SeededData = {
    servers: [],
    channels: [],
    notes: [],
    schedules: [],
    inbox: [],
    apiKeys: [],
    token: '',
  };

  const errors: string[] = [];

  // ── Step 1: Register or Login ────────────────────────────────

  let accessToken = '';
  let registerFailed = false;

  try {
    const regResp = await request.post('/api/auth/register', {
      data: {
        username: TEST_USER.username,
        password: TEST_USER.password,
        display_name: '测试用户A',
      },
    });
    if (!regResp.ok()) {
      registerFailed = true;
    } else {
      const regBody = await regResp.json();
      if (regBody.success) {
        accessToken = regBody.data.token.access_token;
        console.log('[seed] registered new user:', TEST_USER.username);
      }
    }
  } catch {
    registerFailed = true;
  }

  if (registerFailed) {
    console.log('[seed] register failed (user may exist), trying login...');
    const loginResp = await request.post('/api/auth/login', {
      data: { username: TEST_USER.username, password: TEST_USER.password },
    });
    expect(loginResp.ok(), 'Login should succeed').toBeTruthy();
    const loginBody = await loginResp.json();
    expect(loginBody.success, 'Login response should be successful').toBeTruthy();
    accessToken = loginBody.data.token.access_token;
    console.log('[seed] logged in as:', TEST_USER.username);
  }

  seeded.token = accessToken;
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // ── Step 2: Create 3 Servers ─────────────────────────────────

  console.log('[seed] creating servers...');
  for (let i = 0; i < SERVERS.length; i++) {
    const srv = SERVERS[i];
    const resp = await request.post('/api/servers', {
      data: {
        name: srv.name,
        description: SERVER_DESCRIPTIONS[srv.name] || '',
        sort_order: i,
      },
      headers: authHeader,
    });
    if (!resp.ok()) {
      errors.push(`Failed to create server "${srv.name}": ${resp.status()}`);
      continue;
    }
    const body = await resp.json();
    expect(body.success, `Server "${srv.name}" created`).toBeTruthy();
    seeded.servers.push({
      id: body.data.id,
      name: srv.name,
      primary_channel_id: body.data.primary_channel_id,
    });
    console.log(`[seed]   server: ${srv.name} (id=${body.data.id}, primary=${body.data.primary_channel_id})`);
  }

  // ── Step 3: Create Channels per Server ──────────────────────

  console.log('[seed] creating channels...');
  for (let i = 0; i < SERVERS.length; i++) {
    const srv = SERVERS[i];
    const serverId = seeded.servers[i]?.id;
    if (!serverId) continue;

    for (const chName of srv.channels) {
      const resp = await request.post(`/api/servers/${serverId}/channels`, {
        data: { name: chName, type: 'text' },
        headers: authHeader,
      });
      if (!resp.ok()) {
        errors.push(`Failed to create channel "${chName}" in server "${srv.name}": ${resp.status()}`);
        continue;
      }
      const body = await resp.json();
      seeded.channels.push({ id: body.data.id, name: chName, server_id: serverId });
      console.log(`[seed]     channel: ${chName} (id=${body.data.id})`);
    }
  }

  // ── Step 4: Create Notes ─────────────────────────────────────

  console.log('[seed] creating notes...');

  // Helper: find channel id by server index and channel name
  function getChannelId(serverIdx: number, channelName: string): number | undefined {
    const svr = seeded.servers[serverIdx];
    if (!svr) return undefined;
    // Check if it's the "General" primary channel
    if (channelName === 'General') return svr.primary_channel_id ?? undefined;
    // Look up in seeded channels
    const ch = seeded.channels.find(c => c.server_id === svr.id && c.name === channelName);
    return ch?.id;
  }

  let firstNoteId: number | undefined;

  for (let i = 0; i < NOTES_CONTENT.length; i++) {
    const nc = NOTES_CONTENT[i];
    const channelId = getChannelId(nc.serverIdx, nc.channelName);
    if (!channelId) {
      errors.push(`Channel not found: server=${SERVERS[nc.serverIdx].name} channel=${nc.channelName}`);
      continue;
    }

    const noteData: Record<string, unknown> = {
      channel_id: channelId,
      content: nc.content,
      content_type: 'markdown',
    };

    // Add reply_to_id for the second note (reply to the first)
    if (i === 1 && firstNoteId) {
      noteData.reply_to_id = firstNoteId;
    }

    // Add user_tags if present
    if (nc.tags && nc.tags.length > 0) {
      noteData.user_tags = JSON.stringify(nc.tags);
    }

    const resp = await request.post('/api/notes', {
      data: noteData,
      headers: authHeader,
    });
    if (!resp.ok()) {
      errors.push(`Failed to create note #${i}: ${resp.status()}`);
      continue;
    }
    const body = await resp.json();
    if (body.success) {
      seeded.notes.push({ id: body.data.id, content: nc.content.substring(0, 40) });
      if (i === 0) firstNoteId = body.data.id;
      console.log(`[seed]   note: "${nc.content.substring(0, 30)}..." (id=${body.data.id})`);
    }
  }

  // ── Step 5: Create Schedule Items ────────────────────────────

  console.log('[seed] creating schedules...');

  // 高等数学 周一 8:00-9:35
  const mathServerId = seeded.servers[0]?.id;
  if (mathServerId) {
    const schResp = await request.post('/api/schedules', {
      data: {
        title: '高等数学',
        description: '周一高等数学课程',
        start_time: '08:00:00',
        end_time: '09:35:00',
        day_of_week: 0, // Monday
        repeat_rule: JSON.stringify({ type: 'weekly' }),
        server_id: mathServerId,
      },
      headers: authHeader,
    });
    if (schResp.ok()) {
      const schBody = await schResp.json();
      // Note: schedules endpoint returns ScheduleResponse directly (not wrapped in ApiResponse)
      seeded.schedules.push({ id: schBody.id, title: schBody.title });
      console.log(`[seed]   schedule: ${schBody.title} (id=${schBody.id})`);
    } else {
      errors.push(`Failed to create 高等数学 schedule: ${schResp.status()}`);
    }
  }

  // 大学英语 周三 10:00-11:35
  const englishServerId = seeded.servers[1]?.id;
  if (englishServerId) {
    const schResp = await request.post('/api/schedules', {
      data: {
        title: '大学英语',
        description: '周三大学英语课程',
        start_time: '10:00:00',
        end_time: '11:35:00',
        day_of_week: 2, // Wednesday
        repeat_rule: JSON.stringify({ type: 'weekly' }),
        server_id: englishServerId,
      },
      headers: authHeader,
    });
    if (schResp.ok()) {
      const schBody = await schResp.json();
      // Direct ScheduleResponse — no ApiResponse wrapper
      seeded.schedules.push({ id: schBody.id, title: schBody.title });
      console.log(`[seed]   schedule: ${schBody.title} (id=${schBody.id})`);
    } else {
      errors.push(`Failed to create 大学英语 schedule: ${schResp.status()}`);
    }
  }

  // ── Step 6: Configure LLM API Keys ───────────────────────────

  console.log('[seed] configuring API keys...');
  for (const keyCfg of API_KEYS) {
    const resp = await request.post('/api/settings/api-keys', {
      data: {
        provider: keyCfg.provider,
        api_key: keyCfg.key,
      },
      headers: authHeader,
    });
    if (!resp.ok()) {
      errors.push(`Failed to save API key for ${keyCfg.provider}: ${resp.status()}`);
      continue;
    }
    const body = await resp.json();
    if (body.success) {
      seeded.apiKeys.push({ id: body.data.id, provider: body.data.provider });
      console.log(`[seed]   api-key: ${body.data.provider} (id=${body.data.id})`);
    }
  }

  // Set preferred LLM to moonshot
  const prefResp = await request.put('/api/settings/me', {
    data: { preferred_llm: 'moonshot' },
    headers: authHeader,
  });
  if (!prefResp.ok()) {
    errors.push(`Failed to set preferred_llm: ${prefResp.status()}`);
  } else {
    console.log('[seed]   preferred_llm set to moonshot');
  }

  // ── Step 7: Create Inbox Items ───────────────────────────────

  console.log('[seed] creating inbox items...');
  for (const content of INBOX_ITEMS) {
    const resp = await request.post('/api/inbox', {
      data: { content, raw_input: content },
      headers: authHeader,
    });
    if (!resp.ok()) {
      errors.push(`Failed to create inbox item: ${resp.status()}`);
      continue;
    }
    const body = await resp.json();
    if (body.success) {
      seeded.inbox.push({ id: body.data.id, content });
      console.log(`[seed]   inbox: "${content.substring(0, 30)}..." (id=${body.data.id})`);
    }
  }

  // ── Step 8: Save Artifacts ──────────────────────────────────

  // Build auth state file (Playwright format: cookies + origins with localStorage)
  const authState = {
    cookies: [],
    origins: [
      {
        origin: 'http://localhost:5173',
        localStorage: [
          { name: 'token', value: accessToken },
          { name: 'theme', value: 'dark' },
        ],
      },
    ],
  };

  // Ensure .auth directory exists
  const authDir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  fs.writeFileSync(AUTH_FILE, JSON.stringify(authState, null, 2));
  console.log(`[seed] auth state saved to ${AUTH_FILE}`);

  fs.writeFileSync(DATA_FILE, JSON.stringify(seeded, null, 2));
  console.log(`[seed] seeded data saved to ${DATA_FILE}`);

  // ── Verification ─────────────────────────────────────────────

  console.log('\n[seed] ── Verification ──');
  console.log(`  Servers:  ${seeded.servers.length} (expected 3)`);
  console.log(`  Channels: ${seeded.channels.length} (expected ≥15, plus 3 auto-General = 18 total)`);
  console.log(`  Notes:    ${seeded.notes.length} (expected ≥15)`);
  console.log(`  Schedules: ${seeded.schedules.length} (expected 2)`);
  console.log(`  Inbox:    ${seeded.inbox.length} (expected 3)`);
  console.log(`  API Keys: ${seeded.apiKeys.length} (expected 3)`);

  // Critical assertions
  expect(seeded.servers.length, 'Must have 3 servers').toBeGreaterThanOrEqual(3);
  expect(seeded.channels.length, 'Must have at least 15 channels (5 per server × 3)').toBeGreaterThanOrEqual(15);
  expect(seeded.notes.length, 'Must have at least 15 notes').toBeGreaterThanOrEqual(15);
  expect(seeded.schedules.length, 'Must have 2 schedules').toBe(2);
  expect(seeded.inbox.length, 'Must have 3 inbox items').toBe(3);
  expect(seeded.apiKeys.length, 'Must have 3 API keys').toBe(3);

  // Report any non-critical errors
  if (errors.length > 0) {
    console.warn(`\n[seed] ⚠️ ${errors.length} non-critical error(s):`);
    for (const err of errors) {
      console.warn(`  - ${err}`);
    }
  }

  console.log('[seed] ✅ seeding complete');
});
