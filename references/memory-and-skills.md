# 记忆、Skill 与契约

## mem0 — 向量记忆

**路径：** [repos/mem0/](repos/mem0/)

- 五类 Provider ABC（LLM/Embedding/Vector/Graph/Reranker）
- scope：user / session / agent / run
- MCP 9 工具

**适合：** 偏好、历史决策类长期记忆。

---

## graphiti — 时序图记忆

**路径：** [repos/graphiti/](repos/graphiti/)

- 双时态 + 事实失效
- Episode 溯源
- 混合检索 + MCP

**适合：** 关系演化、决策时间线。

---

## gbrain（无独立 repo）

经 [repos/gstack/](repos/gstack/) 集成：
- `/setup-gbrain` — 远程 MCP 或本地 PGLite
- `/sync-gbrain` — 刷新 CLAUDE.md 搜索指引
- `/context-save` / `/context-restore`

**定位：** 跨机器工程上下文，与 mem0/graphiti 互补。

---

## gstack — 方法论 Skill

- 23 角色：plan → review → QA → ship
- browse 无头浏览器
- **不是 runtime** — 可作平台内置 skill pack

---

## agents.md — 项目宪法

**路径：** [repos/agents.md/](repos/agents.md/)

- 与 README 分离的可版本化 Agent 上下文
- 毕设：每个 workspace 自动生成/维护 AGENTS.md

---

## 毕设 Memory 策略

```
MemoryProvider (ABC)
├── LocalVectorProvider   ← Phase 3 默认 (pgvector)
├── GraphitiProvider      ← 可选
└── GbrainProvider        ← 可选（工程上下文）
```

Wiki（Git）与 Memory（向量/图）**分工**：前者人读、后者 Agent 检索。
