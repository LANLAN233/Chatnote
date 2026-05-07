# AGENTS.md — ChatNote ("以聊代记")

## Project Status

Graduation thesis (毕设) project. Phase 1 (项目骨架 + 基础 CRUD) is **complete**.

- `backend/` — FastAPI backend with auth, Server/Channel/Note CRUD (93 tests passing)
- `frontend/` — React 19 + TypeScript + TailwindCSS frontend with Discord-style UI (14 tests passing)
- `docs/` — requirements and development plan (source of truth for architecture)
- `demo/bishe-main/` — Gemini-based prototype (gitignored, reference only)
- `skills/` — tooling (gitignored)

### Phase Progress
- ✅ Phase 1: 项目骨架 + 基础 CRUD
- ✅ Phase 2: AI 分类 + 控制台
- ✅ Phase 3: 日程表
- ✅ Phase 4: 插件/Bot 系统（Obsidian 风格重构）
- ✅ Phase 5: WebSocket + 打磨
- ✅ Phase 6: 设置实装 + AI 连接 + UI/UX 重构
- ✅ Phase 7: 控制台会话 + 导航重构
- ✅ Phase 8: 主页概要完善 + Inbox + 每日总结
- ✅ Phase 9: 频道体验修复（AI 发送逻辑、时区、复制、编辑 UI）
- 🔶 Phase 10: 文件系统与附件重构（ServerFilesModal 已实装，拖拽上传已完成，仅 Resources 入口待完善）
- ✅ Phase 11: @/# 指令联想与输入框统一
- ⬜ Phase 11a: 控制台引用查询与内容导入（@# 引用查询 + 内容选取导入）
- ✅ Phase 12: 消息交互增强（右键菜单、钉选、引用、Tag、TTS）
- ⬜ Phase 13: 讨论串（Thread）系统
- ⬜ Phase 14: 多AI编排优化（Inbox/每日总结/引用查询多Agent流水线）
- ⬜ Phase 15: agno 工具生态接入（DuckDuckGo/Calculator/Python/Website Tools）

## Planned Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + TailwindCSS + Vite + Zustand |
| Backend | Python FastAPI + SQLAlchemy 2.0 (async) + aiosqlite |
| DB | SQLite with FTS5 full-text search |
| AI | Multi-LLM (OpenAI / 智谱 / 通义千问) — backend-proxied, never from frontend |
| Realtime | FastAPI WebSocket |
| Testing | pytest (backend), Vitest (frontend) |

## Architecture Notes

- Discord-style hierarchy: **Server → Channel → Note** (not flat folders)
- Single unified input box on home page; AI auto-classifies notes into server/channel
- `@ServerName #ChannelName` syntax for manual targeting
- Console supports `/` commands (`/help`, `/search`, `/todo`, `/schedule`, `/today`)
- Plugin system: `BasePlugin` class with `on_message`, `on_command`, `on_schedule` hooks
- API responses use uniform format: `{ success: bool, data: any, message?: string }`
- LLM API keys encrypted server-side, never exposed to frontend

## Communication

- **默认使用中文回复**，除非用户明确指定其他语言。代码、注释、Commit Message 仍使用英文。

## Development Workflow

1. **`docs/` is the source of truth.** Always follow `docs/requirements.md` and `docs/development-plan.md` when building. If code conflicts with docs, trust docs.
2. **One Phase at a time.** Follow the Phase order in `docs/development-plan.md` (Phase 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13). Never jump ahead or work on multiple Phases in one session.
3. **Per-Phase lifecycle:**
   - Complete all tasks listed for the current Phase
   - Run unit tests (pytest for backend, Vitest for frontend) — every Phase must pass
   - Verify all deliverables and checkpoints listed in the development plan for that Phase
   - If any checkpoint fails, fix before proceeding
   - Commit with a Conventional Commits message in English (e.g. `feat: scaffold backend with server/channel/note CRUD`)
   - **Stop immediately and report** — do not start the next Phase until instructed
4. **Unit tests are mandatory.** Every Phase must include corresponding unit tests before the commit.

## Code Conventions

- **Python:** PEP8, Black formatting, isort imports
- **TypeScript:** ESLint + Prettier
- **Commits:** Conventional Commits (`feat:`, `fix:`, etc.)
- **Git branches:** `main` (stable), `develop` (dev), `feature/xxx`, `fix/xxx`

## Demo Prototype (Reference)

Located at `demo/bishe-main/`. Run with:

```
cd demo/bishe-main
npm install
# Create .env.local with GEMINI_API_KEY=your_key
npm run dev        # starts on port 3000
```

Key differences from planned real app: demo has no backend (in-memory state), uses Gemini directly from frontend, uses flat `#Subject` tags instead of `@Server #Channel`, and has hardcoded plugins.

## When Building the Real App

- Frontend goes in `frontend/`, backend in `backend/` at workspace root (see `docs/requirements.md` §5 for full tree)
- Backend entrypoint: `backend/app/main.py`
- Database migrations: Alembic (`backend/alembic/`)
- Plugin directory: `backend/app/plugins/`
- Built-in plugins: Math Solver, Summary Bot, Class Watcher
- Dev prerequisites: Node.js 20+, Python 3.11+
