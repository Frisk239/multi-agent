# Multi-Agent — 毕设工作区

面向软件工程的 **Agent 编排 + 项目 Wiki + 跨会话记忆** 平台（一人 · 约一年）。

## 目录地图

```
multi-agent/
├── README.md                 ← 你在这里（总导航）
│
├── design/                   毕设设计（你要实现的系统）
│   ├── architecture.md       四层架构、技术选型、数据模型
│   ├── roadmap.md            一年四阶段 + demo + 风险
│   └── synthesis.md          ★ 综合分析：Pi能否做底层 + TS架构建议 + 借鉴清单
│
├── chanpin/                  ★ 产品规格 + 可交互原型（PM小队产出，已验收）
│   ├── PRODUCT-BRIEF.md      产品简报 + MoSCoW
│   ├── ANALYSIS.md           ★ 原型调研报告（数据模型→生产schema映射）
│   ├── docs/prd/             PRD + RTM（88 Must 需求矩阵）
│   ├── prototype/            可交互 HTML 原型（双击 index.html 即运行）
│   └── research/             竞品分析 + persona + JTBD
│
├── references/               参考项目（读别人的代码前先读这里的分析）
│   ├── catalog.md            12 项目总览矩阵
│   ├── orchestration.md      编排层：multica、hermes kanban
│   ├── runtime.md            执行层：hermes、pi
│   ├── wiki.md               知识层：openwiki、WeKnora、llm-wiki-agent…
│   ├── memory-and-skills.md  记忆 + gstack + agents.md
│   ├── deep/                 ★ 源码级深读（带 file:line 索引）
│   │   ├── multica.md            状态机/WS/Squad/Autopilot/Daemon
│   │   ├── hermes-execution.md   Agent loop + Tool Registry
│   │   ├── hermes-memory-delegate.md  Memory + delegate + Footprint Ladder
│   │   └── pi.md                 架构 + SDK 嵌入入口
│   └── repos/                上游开源 clone（只读，独立 git）
│
├── concepts/                 跨项目理论/模式（与具体 repo 无关）
│   └── llm-wiki-pattern.md   Karpathy 式「编译式 Wiki」
│
└── app/                      你的应用代码（尚未开始）
    ├── .progress/            ★ 跨会话 handoff 文档（计划者-执行者交接）
    └── README.md
```

## 按目的找文档

| 我想… | 打开 |
|---|---|
| ★ 看产品最终长什么样（可交互） | [chanpin/prototype/index.html](chanpin/prototype/index.html) |
| ★ 看原型数据模型怎么映射生产 schema | [chanpin/ANALYSIS.md](chanpin/ANALYSIS.md) |
| ★ 看技术选型结论（Pi能否做底层、怎么用TS造multica） | [design/synthesis.md](design/synthesis.md) |
| 看毕设整体架构与创新点 | [design/architecture.md](design/architecture.md) |
| 看每月该做什么 | [design/roadmap.md](design/roadmap.md) |
| 看 PRD 和需求矩阵（88 Must） | [chanpin/docs/prd/multi-agent-platform-rtm-v2.md](chanpin/docs/prd/multi-agent-platform-rtm-v2.md) |
| 快速扫 12 个参考项目 | [references/catalog.md](references/catalog.md) |
| 深入某一层该抄什么 | [references/](references/README.md) 下对应文件 |
| 看源码级深读（带 file:line 索引） | [references/deep/](references/deep/) |
| 理解 Wiki 模式（论文 Related Work） | [concepts/llm-wiki-pattern.md](concepts/llm-wiki-pattern.md) |
| 直接读上游源码 | [references/repos/](references/repos/) |

## 当前状态

- ✅ 参考仓库已归类到 `references/repos/`（12 个独立 clone）
- ✅ 源码深读完成：`references/deep/`（multica/hermes/pi，带 file:line 索引）
- ✅ 技术选型锁定：`design/synthesis.md`（TS 全栈 + Pi 当 Backend 之一 + 纯本地）
- ✅ **产品原型已验收**：`chanpin/prototype/`（88 Must REQ 可交互，数据模型可直接映射生产 schema）
- ⬜ **应用代码** — 待在 `app/` 启动 Phase 0

## 工作标题（暂定）

**面向软件工程的 Agent 编排与项目知识平台**
