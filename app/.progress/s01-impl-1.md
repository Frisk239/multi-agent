# Handoff: S01-impl-1（monorepo 根骨架 + shared 契约）

> 切片：`S01` · 角色：`impl` · 序号：`1`
> 日期：2026-07-09
> 作者：S01 执行者 1（impl-1）
> 分支：`feat/s01-kanban-ws`

## 上下文（给下一个会话读）

S01 是平台第一个垂直切片（看板 + WebSocket）。本会话是**契约层**——所有后续执行者依赖的地基。

读 [AGENTS.md §工程模式](../../AGENTS.md) + [spec §2/§3/§4](../../docs/superpowers/specs/2026-07-08-s01-kanban-ws-design.md) + [实现计划](../../docs/superpowers/plans/2026-07-09-s01-kanban-ws.md) 的"执行者片段 A/B" + [s01-planner-1.md](./s01-planner-1.md)（计划者给的 8 条注意点）+ 本文件。

**impl-1 范围已完成**（计划的 Task 1.1 + 1.2 + 1.3）。下一个执行者（impl-2）做 server 全栈（Task 2.x）。

## 本会话完成了什么

**Task 1.1 — monorepo 根骨架（commit `72ea580`）**
- `app/package.json`（pnpm workspace 根，scripts: dev/typecheck/build，`packageManager: pnpm@10.33.0`）
- `app/pnpm-workspace.yaml`（`packages: [packages/*]`）
- `app/tsconfig.base.json`（ES2022 + ESNext + bundler + strict）
- `app/.gitignore`（node_modules/dist/*.db/.next/.turbo 等）

**Task 1.2 — @ma/shared Zod 契约（commit `69334c9`）**
- `app/packages/shared/package.json`（`@ma/shared`，`main: ./src/index.ts` 不构建，`type: module`）
- `app/packages/shared/tsconfig.json`（继承 base）
- `app/packages/shared/src/schema.ts` — spec §4 全部契约（照抄计划）：
  - 枚举：`IssueStatus`(7态) / `Priority`(5档) / `AssigneeType`(member/agent/squad) / `CreatorType`(member/agent)
  - `Assignee`（含 R2 修订的 `label` 字段，nullable）
  - `Issue` 实体（Zod + 推导类型双导出）
  - `CreateIssueInput`（assignee 输入**不带** label）+ `UpdateIssueInput`
  - `validateUpdateIssue(d)` 独立函数（R1 修订，不在 Zod 链上）
  - WS 事件：`IssueCreatedEvent` / `IssueUpdatedEvent` / `DomainEvent` 联合类型
- `app/packages/shared/src/index.ts` — `export * from './schema.js'`（ESM `.js` 扩展）

**Task 1.3 — 本 handoff**

## 自测结果

```
$ cd app && pnpm --filter @ma/shared typecheck
> @ma/shared@0.0.0 typecheck D:\code\multi-agent\app\packages\shared
> tsc --noEmit
（无输出 = 0 错误）
```

```
$ cd app && pnpm -r typecheck
> @ma/shared@0.0.0 typecheck D:\code\multi-agent\app\packages\shared
> tsc --noEmit
（无输出 = 0 错误；只有 shared 一个包，server/web 未建）
```

依赖安装无错（`pnpm install` resolved 2, added 1）。tsc 在 TS 5.9.3 下全绿。

## 与计划的偏离

**1 处偏离（已修复，记于此）：**

| 计划原文 | 实际 | 原因 | 处理 |
|---|---|---|---|
| shared `package.json` 只有 `dependencies.zod`，无 devDependencies | 补了 `devDependencies.typescript: ^5.5.0` | Task 1.2 Step 5 要求跑 `tsc --noEmit`，但计划 Step 1 的 package.json 漏了 typescript，导致 `tsc` 找不到（exit 1）。这是计划内部矛盾 | 加 typescript devDep，版本取与计划 server/web 包一致的 `^5.5.0` |

**实际锁定的依赖版本（计划写的是 `^` 范围，pnpm 解析到的真实版本）：**

| 包 | 计划范围 | 实际版本 |
|---|---|---|
| zod | `^3.23.0` | **3.25.76** |
| typescript | `^5.5.0`（偏离新增） | **5.9.3** |

> 其余无偏离：根 package.json、workspace.yaml、tsconfig.base.json、.gitignore、schema.ts、index.ts 全部照抄计划原文，未"优化/简化"。pnpm 提示可升级到 11.10.0——**未动**，保持计划锁定的 10.33.0。

## 遗留 / 下一个执行者（impl-2）要注意的点

> 不是新计划，是接着干必须知道的坑/约定。

### 1. @ma/shared 消费方式
- **包名 import**：`import { Issue, CreateIssueInput } from '@ma/shared'`（不是相对路径）
- **不构建**：`main: ./src/index.ts`，server（tsx）和 web（`transpilePackages: ['@ma/shared']`）直接读 `.ts` 源码
- **相对 import 带 `.js`**：shared 内部已是 `export * from './schema.js'`。**你的 server/web 包内的相对 import也要带 `.js`**（ESM 规则，`moduleResolution: bundler` + `module: ESNext` 下必需）。例如 `import { db } from './client.js'`，`import { issues } from '../db/schema.js'`
- server 的 `tsconfig.json` 需 `types: ["node"]`（计划 Task 2.1 Step 2 已含）

### 2. assignee 输入/输出形态差异（R2 修订，最易踩坑）
- **输入** `CreateIssueInput.assignee`：`{ type, id } | null`（**无 label**）。客户端永不传 label。
- **输出** `Issue.assignee`：`{ type, id, label } | null`。label 服务端权威填充。
- → impl-2 在 `reshape.ts`（DB 行 → API Issue）里要调 label map 填 label；POST 路由插 DB 时只取 `input.assignee?.type / .id`，**不接受** label。

### 3. validateUpdateIssue 用法（R1 修订）
- 不在 Zod 链上。PUT 路由：先 `UpdateIssueInput.safeParse(body)`，成功后**单独调** `validateUpdateIssue(parsed.data)`，返回 `false` 则 400「至少传一个字段」。

### 4. shared 已导出的完整清单（impl-2 直接 import）
`IssueStatus, Priority, AssigneeType, CreatorType, Assignee, Issue, CreateIssueInput, UpdateIssueInput, validateUpdateIssue, IssueCreatedEvent, IssueUpdatedEvent, DomainEvent`（Zod schema + 同名 TS 类型双导出）。

### 5. 工程约定
- 继续在 `feat/s01-kanban-ws` 分支工作（**不开新分支**）
- 每个 Task 结束 commit，Conventional Commits
- Windows 下 git 有 CRLF 警告，正常现象，不影响

## 验收结论（仅计划者填）

- [ ] typecheck 通过 —— **impl-1 已验证 @ma/shared typecheck 全绿**
- [ ] `pnpm dev` 能跑（impl-2 后）
- [ ] 切片验收标准达成（impl-3 后）
- 结论：impl-1 范围（Task 1.1 + 1.2 + 1.3）完成，移交 impl-2（server 全栈）。1 处计划偏离已记录（补 typescript devDep），不阻塞后续。
