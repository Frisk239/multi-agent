# 毕设设计

本目录是**你要做的系统**的设计文档，与 `references/`（别人怎么做）分离。

| 文件 | 内容 |
|---|---|
| [architecture.md](architecture.md) | 问题定义、四层架构、技术选型、数据模型、设计决策 |
| [roadmap.md](roadmap.md) | ★ **路线 + 目标 + 切片队列真源**（G1–G5 Goal 体系，2026-08-02 起现行） |
| [slices.md](slices.md) | 历史切片档案（S01–S12 + 补1–5 + Phase A–F + 优化波，全部已关） |
| [synthesis.md](synthesis.md) | ★ 技术选型综合分析 + 借鉴清单 |

阅读顺序：**architecture → synthesis → roadmap**（roadmap 的 Goal 与队列随迭代更新）。

**迭代机制：** goal 模式（用户 `/goal` 定义目标，引用 roadmap §3 的 G1–G5）+ Slice Owner 自动迭代（[workflow.md](../docs/agents/workflow.md)）。关刀证据见 [app/.progress/](../app/.progress/)。

上游参考对照见 [../references/catalog.md](../references/catalog.md)。
