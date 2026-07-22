# 应用代码（`app/`）

本地 Multica 风格编排控制台的 **pnpm monorepo** 实现：`shared` · `server` · `web`。

产品定位与工程铁律见仓库根目录 [AGENTS.md](../AGENTS.md) · [CONTEXT.md](../CONTEXT.md)。

## 结构

```
app/
├── packages/
│   ├── shared/    # Zod 契约 + 推导类型（Issue / Agent / Run / Inbox…）
│   ├── server/    # Fastify + Drizzle + SQLite + WebSocket（默认 :3001）
│   └── web/       # Next.js 控制台（默认 :3000）
├── .progress/     # 切片 closeout · Multica gap · 巡览笔记
├── package.json
└── pnpm-workspace.yaml
```

## 启动

```bash
cd app
pnpm install          # 首次 / 依赖变更
pnpm dev              # 并行：@ma/server + @ma/web
pnpm typecheck        # 三包 tsc --noEmit
```

| 入口 | URL |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:3001/api |
| WS | `ws://localhost:3001/ws` |

### 分开启动

```bash
pnpm --filter @ma/server dev    # tsx watch src/index.ts · PORT=3001
pnpm --filter @ma/web dev       # next dev -p 3000
```

前端默认请求 `http://localhost:3001/api`，需同时起 server。

### 数据库

```bash
cd packages/server
pnpm db:migrate       # drizzle 迁移 → 默认 ./dev.db
pnpm db:seed          # seed 智能体/小队/样例 Issue（会写入基础数据）
pnpm ma -- --help     # 本机 ma CLI（如 issue create）
```

- DB 路径：`DB_PATH` 或默认 `packages/server/dev.db`  
- 迁移目录：`packages/server/drizzle/`  

### 环境变量（常用）

| 变量 | 作用 |
|---|---|
| `MA_WORKSPACE_CWD` | 工作区根路径（**覆盖** Settings 里持久化的 `workspace.root_path`） |
| `PORT` | server 端口（默认 3001） |
| `DB_PATH` | SQLite 文件路径 |
| `WIKI_LLM_*` / embedding | Wiki 编译用密钥（**仅 env**，Settings 只检测不写库） |

参考：`packages/server/.env.example`（本地 `.env` 已 gitignore）。

## 主路径一览

侧栏 IA（对齐 Multica 本地体验，并保留超车入口）：

| 段 | 路由 |
|---|---|
| 个人 | `/inbox` 收件箱 · `/chat` 聊天 · `/`+assignee 我的 issue |
| 工作区 | `/` Issues 看板 · `/projects` · `/automation` · `/agents` · `/squads` · `/usage` |
| 本地运维（超车） | `/runs` · `/wiki` · `/memory` |
| 配置 | `/runtimes` 本机 CLI · `/skills` · `/settings` |

Agent 可绑定 **runtime**（claude-code / opencode / cursor）与 **model**（如 `opencode/big-pickle`）；模型列表：`GET /api/runtimes/:id/models`。

## 工程约定

- **默认可在 `main` 开发并 `git push origin main`**（人授权简化流程；大实验可用 `feat/*`）  
- Conventional Commits：`feat:` / `fix:` / `docs:` / `chore:` …  
- 关刀：typecheck + 相关 Playwright/API 烟测；证据写 `app/.progress/*-impl-*.md`  
- **勿 commit：** `wiki/`、`packages/server/wiki/`、`*.db`、含密钥的 `.env`、真站 `storage-state`  

差距与进度：

- [主航道 gap](.progress/multica-gap-2026-07-17.md)  
- [真站体验 gap](.progress/multica-gap-live-2026-07-19.md)  
- [2026-07-21 UI 巡览](.progress/ui-multica-parity-tour-2026-07-21.md)  

## 文档入口

| 文档 | 路径 |
|---|---|
| 项目宪法 | [../AGENTS.md](../AGENTS.md) |
| 当前方位 | [../CONTEXT.md](../CONTEXT.md) |
| 技术选型 | [../design/synthesis.md](../design/synthesis.md) |
| 工作流 / merge | [../docs/agents/workflow.md](../docs/agents/workflow.md) · [../docs/agents/merge.md](../docs/agents/merge.md) |
| 产品原型 UI 真源 | [../chanpin/prototype/](../chanpin/prototype/) |
| 数据模型种子 | [../chanpin/prototype/data/seed.js](../chanpin/prototype/data/seed.js) |
| Multica 深读 | [../references/deep/multica.md](../references/deep/multica.md) |

## 历史切片（索引）

S01–S12 与补1–5 已合 main；细节以 `git log` 与 `.progress/s*-impl-*.md` / `bu*-impl-*.md` 为准。  
产品演进不再走自动 S 编号，而走 **Slice Owner 厚切片**（见 AGENTS.md）。
