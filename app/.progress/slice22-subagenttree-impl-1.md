# Slice 22 (S8): 子代理委派可视化 (`parentRunId` 树状展开 + 委派链路图 + 父侧摘要收集) 实现闭环

> **切片定义**：S8 - 子代理委派可视化与层次化展叠  
> **核心目标**：对标 Multica / Hermes 的子代理委派链路与层级树展叠，提供 `parentRunId` 关联的完整 Run Tree 结构、统计指标、父侧收集到的摘要产出与终端快速跳转。

---

## 1. 架构设计与改动清单

### 1.1 类型定义 (`packages/shared/src/schema.ts`)
- 新增 `RunTreeNode` 类型与 `RunTreeNodeSchema` zod schema，定义递归树节点数据结构：
  - `id`, `parentRunId`, `agentId`, `agentName`, `agentRole`, `status`, `kind`, `quickPrompt`, `isLeader`, `squadId`
  - `createdAt`, `startedAt`, `finishedAt`, `durationMs`, `error`
  - `summary`: 父侧/本侧收集到的最终产出与摘要信息
  - `tokensInput`, `tokensOutput`
  - `children`: `RunTreeNode[]`

### 1.2 后端 API (`packages/server`)
- **核心模块 `packages/server/src/orchestration/subagent-tree.ts`**:
  - `getRunTree(rootRunId: string): RunTreeNode | null`:
    - 基于 SQLite 表 `agent_run` 查询 parent-child 层级关系
    - 结合 `agent` 表补全智能体 Name / Role 标识
    - 提取 `run_message` 中 `kind = 'assistant'` 的最新输出作为父侧收集到的 `summary`
    - 计算 `durationMs` 与 Token 消耗
  - `getDirectChildren(parentRunId: string): RunTreeNode[]`:
    - 快速返回直接子代理节点列表
- **Fastify 路由 `packages/server/src/routes/runs.ts`**:
  - `GET /api/runs/:runId/tree`: 获取指定 Run 的完整递归层级树及摘要
  - `GET /api/runs/:runId/children`: 获取指定 Run 的直接子代理列表及摘要

### 1.3 前端可视化 UI (`packages/web`)
- **React 组件 `packages/web/components/SubagentTreeViewer.tsx`**:
  - **统计栏与顶栏**: 显示总子任务数、执行中/完成/失败计数、总耗时与 Token 消耗
  - **双视角切换**:
    - **树状层级 (Tree View)**: 支持逐级展开/折叠、微动特效 Badge (如执行中 Pulsing Blue Dot)、角色 Badge、Prompt 预览、父侧摘要 Accordion 折叠卡片、终端直接跳转按钮
    - **委派链路图 (Flow Diagram)**: 可视化父子 Agent 委派链路 Flow Chart，快速查看状态与产出摘要
- **页面集成 `packages/web/components/RunDetailPage.tsx`**:
  - 嵌入 `<SubagentTreeViewer runId={runId} />`
- **React Query Hook `packages/web/lib/api.ts`**:
  - `useRunTree(runId, opts)`: 实时轮询拉取 / 缓存 Run Tree

---

## 2. 验证结果

### 2.1 TypeScript 类型检查
```bash
pnpm typecheck
# Output:
Scope: 3 of 4 workspace projects
packages/shared typecheck: Done
packages/server typecheck: Done
packages/web typecheck: Done
```
**结果**：0 报错 100% 通过。

### 2.2 Vitest 单元测试
- 测试文件：`packages/server/src/orchestration/subagenttree.test.ts`
- 测试点：
  1. 不存在 RunId 返回 `null`
  2. 递归构建 Root -> Child -> Grandchild Run Tree，验证 status、parentRunId 关联、durationMs 计算与 summary 抽取
  3. `getDirectChildren` 仅提取直接子节点
```bash
pnpm --filter @ma/server exec vitest run src/orchestration/subagenttree.test.ts
# Output:
✓ src/orchestration/subagenttree.test.ts (3 tests) 4ms
Test Files  1 passed (1)
     Tests  3 passed (3)
```

### 2.3 Playwright E2E 验证
- 脚本文件：`scripts/e2e-slice22-subagenttree.js`
- 覆盖流程：
  1. 数据库 Seed 父节点 Run 与子节点 Runs（包含运行中与已完成状态，及 assistant summary 消息）
  2. 浏览器访问 `/runs/:id`，验证 `<SubagentTreeViewer>` 自动渲染
  3. 校验子节点名称、状态 Badge、耗时与 Token 统计
  4. 点击“查看父侧摘要/产出”Accordion 展开并验证 text 内容
  5. 切换 “委派链路图 (Flow Diagram)” 与 “树状层级 (Tree View)” 视角
  6. 验证终端跳转功能

---

## 3. 结论

Slice 22 (S8) **子代理委派可视化 (`parentRunId` 树状展开 + 委派链路图 + 父侧摘要收集)** 已端到端高质量完成，所有规范与验证全部 Green。
