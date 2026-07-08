# 参考项目

本目录 = **对上游项目的阅读笔记** + **本地 clone**。

## 分析文档

### 高层摘要（快速了解每个项目做什么）

| 文件 | 对应层 | 主要 repo |
|---|---|---|
| [catalog.md](catalog.md) | 全景 | 12 项目矩阵 + 关系图 |
| [orchestration.md](orchestration.md) | 编排 | multica、hermes kanban |
| [runtime.md](runtime.md) | 执行 | hermes-agent、pi |
| [wiki.md](wiki.md) | 知识 | openwiki、WeKnora、llm-wiki-agent… |
| [memory-and-skills.md](memory-and-skills.md) | 记忆/方法论 | mem0、graphiti、gstack、gbrain |

### 源码深读（动手前必读，带 file:line 索引）

| 文件 | 项目 | 深入什么 |
|---|---|---|
| [deep/multica.md](deep/multica.md) | multica | 状态机（DB行即锁）、WS三跳、Squad、Autopilot、Daemon |
| [deep/hermes-execution.md](deep/hermes-execution.md) | hermes | Agent loop（5312行循环剖析）、Tool Registry、Prompt cache 保护 |
| [deep/hermes-memory-delegate.md](deep/hermes-memory-delegate.md) | hermes | MemoryProvider ABC、delegate 子 Agent、Footprint Ladder |
| [deep/pi.md](deep/pi.md) | pi | Monorepo、AgentMessage双层、SDK入口、RPC嵌入 |

### 综合分析

| 文件 | 回答什么 |
|---|---|
| [../design/synthesis.md](../design/synthesis.md) | **Pi 适合做底层吗？如何用 TS 造 multica-like？各项目借鉴清单** |

## 源码 clone（只读）

路径：`repos/` — 每个子目录是独立 git 仓库，**不要在此改上游代码**。

| 目录 | 分层 |
|---|---|
| [repos/multica/](repos/multica/) | 编排 |
| [repos/hermes-agent/](repos/hermes-agent/) | 执行（含 kanban 插件） |
| [repos/pi/](repos/pi/) | 执行 |
| [repos/openwiki/](repos/openwiki/) | 知识 |
| [repos/WeKnora/](repos/WeKnora/) | 知识 + 平台 |
| [repos/OpenDeepWiki/](repos/OpenDeepWiki/) | 知识（重） |
| [repos/llm-wiki-agent/](repos/llm-wiki-agent/) | 知识工作流 |
| [repos/deepwiki-open/](repos/deepwiki-open/) | 知识 MVP |
| [repos/mem0/](repos/mem0/) | 记忆 |
| [repos/graphiti/](repos/graphiti/) | 记忆（图） |
| [repos/gstack/](repos/gstack/) | Skill 方法论 + gbrain |
| [repos/agents.md/](repos/agents.md/) | AGENTS.md 规范 |

## 推荐阅读顺序

1. [catalog.md](catalog.md) 总览 12 个项目
2. [../design/synthesis.md](../design/synthesis.md) **综合结论**（Pi 能否做底层 + 架构建议）
3. 按当前开发阶段读对应的深读：
   - 做编排层 → [deep/multica.md](deep/multica.md)
   - 接执行层 → [deep/pi.md](deep/pi.md)
   - 做记忆层 → [deep/hermes-memory-delegate.md](deep/hermes-memory-delegate.md)
   - 做知识层 → [wiki.md](wiki.md) + [../concepts/llm-wiki-pattern.md](../concepts/llm-wiki-pattern.md)
4. 需要细节时查对应高层摘要文档

## 散落文件

- [notes-connect-coding-agent.md](notes-connect-coding-agent.md) — gbrain 接 Claude Code / Codex 的接入笔记
