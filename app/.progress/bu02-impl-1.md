# Handoff: bu02-impl-1

> 切片：`补2` / `bu02` · 角色：`impl` · 序号：`1`  
> 日期：2026-07-17  
> 分支：`feat/bu02-roster-ops` @ `bdd4979`  
> worktree：`.worktrees/bu02-roster-ops`

## 上下文（给下一个会话读）

补2 厚切片 **Task 1–3（API/schema/prompt）**。  
plan：[`docs/superpowers/plans/2026-07-17-bu02-roster-ops.md`](../../docs/superpowers/plans/2026-07-17-bu02-roster-ops.md)  
kickoff：[`app/.progress/bu02-planner-0.md`](./bu02-planner-0.md)

**本棒不做 Web UI。** impl-2 做 Task 4–6。

## 本会话完成了什么

### Task 1 — Shared + migration + reshape
- `AgentDetail.instructions: string`（默认 `""`）
- `CreateAgentInput` / `UpdateAgentInput`
- `CreateSquadInput` / `UpdateSquadInput`
- `AgentReadiness`
- `AgentSummary.category?`、`SquadSummary.leaderId?` + `memberCount?`
- DB：`agents.instructions text not null default ''`
- Migration：`0008_bu02_agent_instructions.sql` + journal idx 8
- `toAgentSummary` / `toAgentDetail` in `reshape.ts`

### Task 2 — Agent CRUD + readiness + runs + prompt
| Method | Path | 行为 |
|---|---|---|
| POST | `/api/agents` | CreateAgentInput → 201 AgentDetail |
| PATCH | `/api/agents/:id` | UpdateAgentInput → AgentDetail |
| DELETE | `/api/agents/:id` | 204；活跃 run / 仍是 squad leader → 409 |
| GET | `/api/agents/:id/readiness` | AgentReadiness |
| GET | `/api/agents/:id/runs?limit=` | AgentRun[] 新→旧，limit 1–100 default 20 |

- `orchestration/readiness.ts`：`computeAgentReadiness`
- `buildPrompt` 注入顺序锁定：  
  **skill → wiki → memory → `# Agent Instructions` → briefing(if leader) → issue body**

### Task 3 — Squad CRUD + members
| Method | Path | 行为 |
|---|---|---|
| POST | `/api/squads` | CreateSquadInput → 201 SquadDetail |
| PATCH | `/api/squads/:id` | UpdateSquadInput；`memberIds` 整表替换 |
| DELETE | `/api/squads/:id` | 未终态 issue 指派 → 409；否则删 members + squad |
| GET | `/api/squads` | `{ id, name, leaderId, memberCount }` |

成员语义：`squad_member` = peers；leader 在 `squad.leader_id`；memberIds 可含 leader（幂等）；空 memberIds = solo squad。

## 自测结果

### typecheck
```
$ cd app && pnpm -r typecheck
Scope: 3 of 4 workspace projects
packages/shared typecheck$ tsc --noEmit → Done
packages/server typecheck$ tsc --noEmit → Done
packages/web typecheck$ tsc --noEmit → Done
```

### migrate + seed（独立 smoke DB，未提交）
```
DB_PATH=./bu02-smoke.db
✓ 迁移完成
✓ seed 完成：8 条 issue，6 条 comment
```

### API smoke（PORT=3020，`MA_WORKSPACE_CWD` 已设）

| 调用 | 期望 | 结果 |
|---|---|---|
| GET `/api/issues` | 200 | 200 |
| GET `/api/wiki/pages` | 200 | 200 |
| GET `/api/memory/status` | 200 | 200 |
| GET `/api/inbox` | 200 | 200 |
| POST `/api/agents` | 201 + instructions | 201，`instructions:"Always reply short."`，UUID id |
| GET readiness | status 枚举 | `status:"ready"`（本机 claude-code 已装） |
| GET runs | `[]` | `[]` |
| PATCH agent name/instructions | 持久化 | 改名为 Bu02 Renamed，instructions 更新 |
| POST custom id `bu02-custom` | 201 | 201 |
| POST 同 id 再创建 | 409 | 409 `agent id 已存在` |
| POST squad + memberIds | SquadDetail | 201，members 含 peer |
| PATCH squad missionDirective | 更新 | 200，directive=`更新指令` |
| DELETE agent 当 leader | 409 | 409 `仍是小队 … 的 leader` |
| DELETE squad | 204 | 204 |
| DELETE agent 无引用 | 204 | 204 |
| DELETE seed `agt-lead` | 409 | 409 `仍是小队 产品小队 的 leader` |
| PATCH agent `{}` | 400 empty patch | 400 |
| GET `/api/agents/agt-lead` | instructions 字段 | `"instructions":""` |
| GET `/api/squads` | leaderId + memberCount | 有 |

**prompt 注入：** 代码路径已在 `prompt.ts`（memory 后 / briefing 前 push `# Agent Instructions`）。本棒未跑真实 CLI execute；impl-2/人评可在 run 时确认。

## 与计划的偏离

1. **单 commit 合并 Task 1–3**（计划分 3 次 commit）。因同一 API 面与契约强耦合，合为：  
   `feat(bu02): agent/squad CRUD, readiness, runs, prompt instructions` (`bdd4979`)。
2. **GET `/api/agents/:id` 缺失时从「200 null」改为 404**（与 squad 一致，利于前端 `res.ok`）。
3. **worktree 基于本地 `main@280e00c`**（含 PR #12）。当时 `git fetch origin` 因代理连不上 GitHub 失败，非 `origin/main` 远端快照；内容与当前本地 main 一致。
4. **curl 中文 JSON body 在 Git Bash 下 Content-Length 易炸**；squad smoke 改用 Python `urllib`。impl-2 手测建议同样避开 bash 里塞中文 body，或用文件/`--data-binary @-`。
5. **未改 Web**；shared 扩展字段均为 additive，`pnpm --filter @ma/web typecheck` 绿。

## 遗留 / 下一个执行者要注意的点

- **impl-2 专心 UI**：hooks `useCreateAgent/useUpdateAgent/useDeleteAgent`、`useAgentReadiness`、`useAgentRuns`、squad 同理。
- **AgentDetail 现必有 `instructions`**；旧 UI 若解构无妨，表单/Placeholder 需换成真 textarea。
- **列表：** `GET /api/agents` 已带可选 `category`；`GET /api/squads` 已带 `leaderId`/`memberCount`——SquadsPage 可直接 map leader 名。
- **删除规则写死：** agent 有 queued/running run 或仍是 leader → 409；squad 被未终态 issue 指派 → 409。
- **ID：** 默认 UUID；可选 `id` 仅当 `^[a-z][a-z0-9_-]{1,63}$`。
- **readiness 优先级：** `cwd_missing` > `runtime_missing` > `busy` > `ready`；detect 抛错 → `error`。
- **本地 smoke DB** `app/packages/server/bu02-smoke.db*` 勿 commit（已 .gitignore 风格 `*.db` 预期；提交前确认 `git status` 干净）。
- **server 若仍占 3020**：worktree 内临时进程，可杀；不要 commit 运行产物 `wiki/`。
- pull 本分支后再开 UI 棒；契约以 shared 为准。

## 验收结论（仅计划者填）

- [x] 0008 + instructions 列  
- [x] Agent/Squad CRUD 齐；409 规则  
- [x] readiness / runs  
- [x] prompt 注入顺序正确（skill→wiki→memory→instructions→briefing→body）  
- [x] typecheck + smoke（handoff + 计划者复验 typecheck）  
- [x] 无 UI 半残要求（本棒未改 web；shared 未弄红 web）  
- 结论：**impl-1 达标**（与 impl-2 一并整刀验收）
