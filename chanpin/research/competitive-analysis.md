# 竞品矩阵 — 本地 Agent 编排与项目知识平台

> 2026-07-08 · Scope：对齐 PRODUCT-BRIEF Must · 不含真实后端执行  
> 分析维度：Issue 编排 / Squad / Agent+Skill / 布局 / Wiki / 本地部署

---

## Overview

**分析范围：** 面向「单人开发者 / 毕设作者」的 **Agent 任务编排 + 项目知识** 控制台 MVP（PRD + 可交互原型）。  
**不在范围：** 执行层 benchmark、定价战、企业采购决策。  
**竞品数量：** 5 家（1 直接 + 4 间接）

---

## Market Context

AI 编码 Agent 2026 年呈**三层分化**（推断，Confidence: Medium）：

1. **IDE/CLI 执行层** — Cursor、Claude Code、Devin：强在执行，弱在任务编排
2. **编排/托管层** — Multica、OpenHands（部分）：Issue/队列/WS，Multica 最完整
3. **知识/记忆层** — WeKnora、llm-wiki、mem0：RAG/Wiki/向量，缺 Issue 生命周期

本毕设定位：**在本地用 Multica 级编排 UX + Wiki 占位，填补「编排可见性 + 项目知识」一体化空白**。论文 Related Work 可引用 `references/catalog.md` 12 项目矩阵。

---

## Competitors Analyzed

| # | 竞品 | 类型 | 关系 |
|---|------|------|------|
| 1 | **Multica** | 直接 | 视觉与编排模式的主要参考；本毕设 = Multica-like + Wiki/Memory |
| 2 | **Cursor** | 间接 | 执行层替代；用户已用，但不做 Issue/Squad |
| 3 | **OpenHands** | 间接 | 开源自主 Agent；子 Agent 有，看板编排弱 |
| 4 | **Devin** | 间接 | 云端自主 PR；任务委派模式不同 |
| 5 | **WeKnora** | 间接 | 企业 RAG+Wiki；知识层参考，编排弱 |

*Hermes Kanban、llm-wiki-agent 见 `references/catalog.md`，作为分层参考不重复展开。*

---

## Feature Comparison Matrix（Must 对齐）

| 能力 | 本毕设 MVP | Multica | Cursor | OpenHands | Devin | WeKnora |
|------|-----------|---------|--------|-----------|-------|---------|
| **Issue 看板** | ✅ Must（mock） | ✅ Full | ❌ None | ⚠️ Partial（task 无看板 UI） | ⚠️ Partial（Slack/Jira 触发） | ❌ None |
| **Issue 时间线** | ✅ Must | ✅ Comment 线程 | ❌ | ⚠️ Session log | ⚠️ Replay | ❌ |
| **Squad 队长路由** | ✅ Must（mock） | ✅ Leader briefing + @mention | ❌ | ⚠️ Sub-agent，无 squad 概念 | ❌ | ❌ |
| **Agent CRUD** | ✅ Must | ✅ Full | ⚠️ 规则/Agents 设置 | ✅ Agent 配置 | ✅ Agent 实例 | ⚠️ Agent 模块 |
| **Skill 导入+分配** | ✅ Must（URL mock） | ✅ GitHub/ClawHub/本地 | ⚠️ Rules/MDC | ⚠️ 插件 | ❌ | ❌ |
| **Multica 三栏布局** | ✅ Must | ✅ | ❌ IDE 布局 | ❌ | ❌ Web dashboard | ❌ |
| **Wiki 浏览器** | ✅ Must（mock） | ❌ | ❌ | ❌ Devin Wiki（云端） | ⚠️ Auto Wiki | ✅ Full RAG Wiki |
| **MCP 配置入口** | ✅ Must（UI 入口） | ✅ Per-agent | ✅ | ✅ | ⚠️ | ⚠️ |
| **本地/自托管** | ✅ Must | ✅ Local daemon | ✅ 本地 IDE | ✅ OSS 自托管 | ❌ Cloud | ⚠️ 可自托管 |
| **真实 CLI 执行** | ❌ Won't | ✅ 14 CLI | ✅ | ✅ | ✅ | N/A |
| **Memory 层** | Should mock | ❌ | ⚠️ 会话内 | ⚠️ | ❌ | ✅ RAG |
| **Autopilot/Cron** | Should UI | ✅ Full | ❌ | ⚠️ | ✅ | ⚠️ |

图例：✅ Full · ⚠️ Partial · ❌ None/超 scope

---

## Positioning Map（2×2）

```
                    编排/任务管理深度
                           ↑
                           |
         Multica ●         |         ● 本毕设 MVP（目标位）
                           |
    OpenHands ●            |
                           |
  Cursor ●                 |
                           |
  Devin ●                  |
                           |
  WeKnora ●                |
                           |
                           └────────────────────────→ 项目 Wiki/知识深度
```

**X 轴：** 项目 Wiki / 知识层能力（本毕设 MVP 用 mock 占位，论文目标向右扩展）  
**Y 轴：** Issue/Squad/任务编排深度  

**White space（本毕设目标位）：** 高编排 UX（学 Multica）+ 本地 Wiki 叙事（学 llm-wiki/WeKnora），且**纯本地单进程**简化 multica 云端+daemon 复杂度。

**Confidence：Medium** — 定位图为基于文档与公开信息的推断

---

## Competitor Deep Dives

### 1. Multica（直接竞品 / 设计参考）

| 维度 | 内容 |
|------|------|
| **定位** | 开源 Agent 托管平台 — coding agents as teammates（[multica.ai](https://www.multica.ai/)） |
| **Strengths** | Issue 指派 Agent/Squad；完整任务状态机 + WS；14 CLI daemon；Skill 复利；Squad leader briefing（`references/deep/multica.md`） |
| **Weaknesses（相对本毕设目标）** | 无 Wiki/Memory 联动；云端 server + local daemon 双进程架构对一人毕设过重 |
| **Must 对齐** | 看板、Squad、Agent、Skill、三栏 —— **原型应高度还原交互，非功能复刻** |
| **Confidence** | High — 项目内源码深读 + 官方文档 |

### 2. Cursor（间接 — 执行层）

| 维度 | 内容 |
|------|------|
| **定位** | AI-native IDE；Agent/Composer 半自主多文件编辑 |
| **Strengths** | 日常编码体验最佳；repo 索引；Background Agents |
| **Weaknesses** | 无 Issue 看板、无 Squad 委派、无项目 Wiki 浏览器；任务状态不在产品中心 |
| **对本毕设含义** | Runtime 绑定选项之一（Phase 2+）；**不是编排 UI 竞品** |
| **Confidence** | Medium — 公开评测 + 项目 architecture 文档 |

### 3. OpenHands（间接 — 开源自主 Agent）

| 维度 | 内容 |
|------|------|
| **定位** | MIT 开源 CodeAct Agent；可自托管（[docs.openhands.dev](https://docs.openhands.dev/)） |
| **Strengths** | TaskToolSet 子 Agent；Docker 沙箱；Browser replay |
| **Weaknesses** | 无 Multica 级 Issue/Squad/Skill 产品化；看板编排非核心 |
| **对本毕设含义** | 执行层 Backend 参考；编排层仍学 Multica |
| **Confidence** | Medium |

### 4. Devin（间接 — 云端自主）

| 维度 | 内容 |
|------|------|
| **定位** | Cognition 云端自主 Agent；VM 内端到端 → PR |
| **Strengths** | 异步委派；大迁移/overnight batch；Devin Wiki |
| **Weaknesses** | 非本地；Issue 编排非中心；成本（~$20+/mo 2026 报道） |
| **对本毕设含义** | Related Work「高自主、低本地控制」对照组 |
| **Confidence** | Medium — 第三方评测（[awesomeagents.ai](https://awesomeagents.ai/tools/devin-vs-cursor-2026/)） |

### 5. WeKnora（间接 — 知识层）

| 维度 | 内容 |
|------|------|
| **定位** | Go + React 企业 RAG + Agent + Auto-Wiki（`references/catalog.md`） |
| **Strengths** | Wiki/RAG 完整；Agent 模块 |
| **Weaknesses** | 多租户/RBAC 过重；Issue 驱动编排非核心 |
| **对本毕设含义** | Wiki 浏览器与 ingest 的 Phase 2+ 参考；MVP 仅 mock |
| **Confidence** | High — 项目内 catalog + wiki.md |

---

## Competitive Gaps and Opportunities

| Gap | 机会 | MVP 动作 |
|-----|------|----------|
| Multica 无 Wiki | 论文创新：Issue 事件 → Wiki ingest | 原型 Wiki 浏览器占位 + PRD 写事件联动（Phase 2） |
| 执行工具无编排 | 一屏任务中心 | Must 看板 + 时间线 |
| Wiki 工具无编排 | Issue 驱动知识更新 | mock Wiki + 叙事 |
| Multica 架构过重 | 纯本地单进程 | PRD 声明简化，原型无 backend |
| 毕设需可演示 | mock 可点通 | 4 条主路径 demo 脚本 |

---

## Strategic Recommendations（给 PRD/原型）

1. **head-on Multica 仅 Must UX** — 看板、三栏、Squad、Agent、Skill；不抄 Autopilot/14 CLI/WS 实装  
2. **differentiate on Wiki 占位** — 侧栏 Wiki 入口 + mock 树，答辩讲「编排事件 → 知识累积」  
3. **demo 路径固定** — ① 看板拖 card ② Issue 时间线 ③ 创建 Agent+导入 Skill ④ Squad 指派+@mention  
4. **Related Work 叙事** — 「Multica 管人管 Agent，WeKnora 管知识，本毕设本地一体化」  
5. **禁止 scope creep** — 竞品矩阵中 OpenHands/Devin 的「真实执行」仅作 Won't 对照，不写进 Must AC  

---

## Sources and Confidence

| 来源 | 用途 | Confidence |
|------|------|------------|
| `D:\code\multi-agent\references\deep\multica.md` | Multica 功能事实 | High |
| `D:\code\multi-agent\references\catalog.md` | 12 项目矩阵 | High |
| `D:\code\multi-agent\design\architecture.md` | 差异化定义 | High |
| [Multica Docs](https://multica.ai/docs/how-multica-works) | 架构/Agent/Skill | High |
| [Multica GitHub](https://github.com/multica-ai/multica) | 定位/tagline | High |
| OpenHands Task Tool Set docs | 子 Agent | Medium |
| 第三方 Agent 对比文章 2026 | Cursor/Devin/OpenHands | Medium（非一手） |

---

## Next Steps

- [ ] 队员 2：从本矩阵 Must 列生成 PRD REQ-ID
- [ ] 队员 3：Positioning 目标位决定侧栏 Wiki 权重
- [ ] 队长：MVP 签核确认 Won't 未渗入 Must
