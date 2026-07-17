# Domain Docs

工程 skills 在探索代码库前如何消费本仓领域文档。

## 动手前先读

- 仓库根 **`CONTEXT.md`**（单一上下文）
- **`docs/adr/`** — 与当前工作相关的 ADR（若存在）
- 产品/架构真源仍在：`design/synthesis.md`、`chanpin/`、`AGENTS.md` 关键决策

文件不存在时 **静默继续**，不要打断用户去「先建空文档」。术语与决策在 `/grill-with-docs` + `/domain-modeling` 里懒创建。

## 布局（本仓：single-context）

```
/
├── CONTEXT.md
├── docs/adr/                 ← 架构决策（渐进积累）
├── docs/agents/              ← issue-tracker / domain / triage 配置
├── design/                   ← 系统架构与路线图（人读 + agent 读）
├── chanpin/                  ← 产品规格与原型
└── app/                      ← 实现 monorepo
```

## 用词

输出里的领域名（Issue、Run、Squad、Wiki、Memory、Automation…）以 `CONTEXT.md` 为准，不另造同义词。

## ADR 冲突

若方案与既有 ADR 矛盾，显式写出，不要静默覆盖。
