# 知识层参考（Project Wiki）

> 理论：[../concepts/llm-wiki-pattern.md](../concepts/llm-wiki-pattern.md)

## 共同模式

**编译式 Wiki vs RAG：** 知识 ingest 时编译进互链 Markdown，而非每次 query 重扫 raw。

| 层 | 职责 | 谁写 |
|---|---|---|
| Raw | 不可变源 | 人 |
| Wiki | 互链 Markdown | Agent |
| Schema | AGENTS.md 规约 | 人+Agent |

---

## openwiki（LangChain）

**路径：** [repos/openwiki/](repos/openwiki/) · 读 `openwiki/quickstart.md`

- Git diff/log 作 evidence
- SHA256 snapshot 防无变化 CI 更新
- 输出 `openwiki/` + 注入 AGENTS.md

**毕设落点：** 仓库级 Wiki CLI；workspace 绑定 repo → `--update`。

---

## llm-wiki-agent

**路径：** [repos/llm-wiki-agent/](repos/llm-wiki-agent/)

工作流：`ingest` / `query` / `health`（零 LLM）/ `lint`（语义）

**毕设落点：** 领域知识库 workflow 模板。

---

## WeKnora Wiki Mode

**路径：** [repos/WeKnora/](repos/WeKnora/)

- ingest 队列 + DLQ
- Wiki 层级 + 知识图
- CLI Agent-first 契约（JSON envelope、exit code、NDJSON）

**毕设落点：** 产品化模块边界与 CLI 设计。

---

## OpenDeepWiki / deepwiki-open

| | OpenDeepWiki | deepwiki-open |
|---|---|---|
| 路径 | [repos/OpenDeepWiki/](repos/OpenDeepWiki/) | [repos/deepwiki-open/](repos/deepwiki-open/) |
| 特点 | catalog/content 模型分离、Worker | 最小 repo→wiki |
| 毕设 | 分阶段流水线参考 | MVP 范围参考 |
