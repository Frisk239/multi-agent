# 应用代码

毕设平台的**自研实现**（pnpm monorepo）。

## 结构

```
app/
├── packages/
│   ├── shared/    # Zod 契约 + 推导类型（Issue / 事件等）
│   ├── server/    # Fastify + Drizzle + SQLite + WebSocket（:3001）
│   └── web/       # Next.js 控制台（:3000）
├── .progress/     # ★ 跨会话 handoff（计划者 / 执行者）
├── package.json
└── pnpm-workspace.yaml
```

## 启动

```bash
cd app
pnpm install
pnpm dev          # 并行起 server:3001 + web:3000
pnpm typecheck    # 三包 typecheck
```

打开 http://localhost:3000 → 六列看板（FRI-04~FRI-11 来自 SQLite seed）。

## 切片进度

| 切片 | 状态 | 说明 |
|---|---|---|
| **S01** 看板 + WebSocket | ✅ 已合 main | PR #1；handoff：`.progress/s01-planner-2.md` |
| **S02** Issue 详情 + 时间线 + 评论 | ⬜ 计划中 | 下一切片 |
| S03+ | ⬜ | 见 [design/slices.md](../design/slices.md) |

## 文档入口

- 工程模式 / 分支规则：[AGENTS.md](../AGENTS.md)
- 切片划分：[design/slices.md](../design/slices.md)
- 技术选型：[design/synthesis.md](../design/synthesis.md)
- 产品 UI 真源：[chanpin/prototype/](../chanpin/prototype/)
- 数据模型真源：[chanpin/prototype/data/seed.js](../chanpin/prototype/data/seed.js)
