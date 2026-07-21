# Multi-Agent — 本地多智能体编排控制台

纯本地（非云端）软件工程多智能体编排平台：**本机编码 CLI 的编排控制台**——派活、小队、追踪、Wiki、记忆，全部本地、可天天用。

**产品一句话：** 人在 Web 控制台分配任务 → Agent 绑定并驱动本机 CLI（Claude Code / opencode / Cursor / …）→ 产出进 **Wiki**、经验进 **Memory**。

**目标定位：** 复刻 **本地版 Multica 控制台体验**（看板派活、小队、run 可观测/恢复、Wiki/Memory、Settings），**不是** Multica Go 栈 / daemon 协议 / 云托管的 1:1 移植。

> 出身可追溯毕设/调研，但**主航道按真实产品做**——日常可用、可演进；答辩/论文不是排期真源。  
> 工程宪法见 [AGENTS.md](AGENTS.md) · 当前方位见 [CONTEXT.md](CONTEXT.md)。

## 快速开始

```bash
cd app
pnpm install
pnpm dev          # 并行：server :3001 + web :3000
```

| 服务 | 地址 |
|---|---|
| Web 控制台 | http://localhost:3000 |
| API / WebSocket | http://localhost:3001 （`ws://localhost:3001/ws`） |

**工作区目录：** Settings 保存，或环境变量 `MA_WORKSPACE_CWD`（覆盖 DB，见 [ADR 0003](docs/adr/0003-workspace-cwd-persistence.md)）。  
**密钥：** Wiki LLM / embedding 仅 env（见 `app/packages/server/.env.example`），不落库。

更多：[`app/README.md`](app/README.md)。

## 目录地图

```
multi-agent/
├── AGENTS.md                 ★ 项目宪法（必读）
├── CONTEXT.md                ★ 领域词汇 + 当前方位
├── README.md                 ← 你在这里
│
├── app/                      ★ 应用代码（pnpm monorepo）
│   ├── packages/shared       Zod 契约 + 共享类型
│   ├── packages/server       Fastify + Drizzle + SQLite + WS（:3001）
│   ├── packages/web          Next.js 控制台（:3000）
│   ├── .progress/            切片 closeout / Multica 差距表 / 巡览笔记
│   └── README.md             启动与开发说明
│
├── design/                   架构与技术选型
│   └── synthesis.md          ★ 技术选型综合分析
├── docs/                     ADR · agents 工作流 · merge 规则
├── chanpin/                  产品规格 + 零依赖 HTML 原型（UI/数据模型真源之一）
├── references/               参考项目摘要 + deep 源码深读 + repos/（只读 clone）
├── concepts/                 跨项目理论（如 llm-wiki 模式）
└── wiki/                     运行期 Wiki 产出（勿 commit）
```

## 按目的找文档

| 我想… | 打开 |
|---|---|
| 了解项目铁律与工程模式 | [AGENTS.md](AGENTS.md) |
| 看当前方位 / 术语 | [CONTEXT.md](CONTEXT.md) |
| 跑本地应用 | [app/README.md](app/README.md) · `cd app && pnpm dev` |
| 技术选型（TS 全栈 · 多 Backend · 纯本地） | [design/synthesis.md](design/synthesis.md) |
| Multica 体验差距（主航道） | [app/.progress/multica-gap-2026-07-17.md](app/.progress/multica-gap-2026-07-17.md) |
| Multica 真站对照（产品壳） | [app/.progress/multica-gap-live-2026-07-19.md](app/.progress/multica-gap-live-2026-07-19.md) |
| 最近 UI 巡览厚切片 | [app/.progress/ui-multica-parity-tour-2026-07-21.md](app/.progress/ui-multica-parity-tour-2026-07-21.md) |
| 可交互产品原型 | [chanpin/prototype/index.html](chanpin/prototype/index.html) |
| 数据模型种子真源 | [chanpin/prototype/data/seed.js](chanpin/prototype/data/seed.js) |
| 上游源码深读（file:line） | [references/deep/](references/deep/) |
| Slice Owner / merge 流程 | [docs/agents/workflow.md](docs/agents/workflow.md) · [docs/agents/merge.md](docs/agents/merge.md) |

## 当前状态（2026-07-21）

| 维度 | 判断 |
|---|---|
| S01–S12 + 补1–5 | ✅ 已合 main；补充阶段收官 |
| 主航道日用 | ✅ 派活 → 执行 → 观测/收尸 → Wiki/Memory → Settings 可闭环 |
| 本地 Multica 产品壳 | ✅ MVP 对齐中；持续体验加深（收件箱/聊天/model/看板 chrome…） |
| Multica daemon / 云协议 1:1 | ❌ 刻意不做 |

**已具备（摘要）：**

- 看板 Issue / 指派 / 标签 / 筛选深链 · 小队 leader + mention  
- 多 RuntimeBackend（claude-code / opencode / cursor）· Agent **model** 绑定与 CLI 发现  
- Run 列表 / 轨迹 / 收尸 / 批量取消 · Inbox 收件箱 · Chat · Automation · Quick-create  
- Wiki 编译运维 · Memory 可插拔 · Settings 健康 + cwd 持久化  
- 本地超车入口：全局运行、Wiki、记忆  

**工程模式：** Slice Owner（一刀一会话）· 可调研 Multica · Playwright 关刀 · **默认可 main 直推**（见 AGENTS.md §工程模式）。

## 技术栈（已锁定）

- TypeScript 全栈（shared 契约）  
- 纯本地混合进程：Node 编排主进程 + 每 agent 子进程 CLI  
- 后端：Node + Fastify + Drizzle · DB：SQLite（向量阶段可 Postgres+pgvector）  
- 前端：Next.js + React Query + Zustand  
- 校验：Zod  

## 不可破坏的约束

- ❌ 不做云端托管 / 多节点 / Redis  
- ❌ 不自造 Agent loop（Backend adapter 驱动已有 CLI）  
- ❌ 不改 `references/repos/` 上游 clone  
- ❌ 不在 `chanpin/prototype/` 引入构建步骤或框架  
- ✅ 密钥不落库；工作区路径可 DB 持久化  

## 工作语言

中文为主（文档与 seed）；代码标识符用英文。
