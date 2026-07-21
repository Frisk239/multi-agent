# Closeout: knowledge-observe-ia

日期：2026-07-21

## 调研（agent-reach / Exa + 本仓深读）

| 来源 | 启示 |
|---|---|
| **Hermes** dashboard / 三层架构 | UI 层与 Core Agent 分离；Memory 是可插拔 provider + 上下文围栏，不是「运维页」 |
| **llm-wiki pattern** / openwiki | Wiki = 编译式持久知识；ingest / query / lint；与 raw 源分离 |
| **Sidecar Mission Control** | 本地 SQLite 看板：Tasks 主视图 + Run detail + Timeline；ops 不抢主航道 |
| **mem0 + OpenWebUI** | 记忆检索注入对话；列表/片段/用户维度，偏经验层 |
| **Multica** | 无 Wiki/Memory 一级；本仓超车须**产品叙事**而非「本地运维」工程腔 |

## 设计结论（推荐档：中厚度）

1. **侧栏**：「本地运维」拆成  
   - **知识**（Wiki → 记忆）  
   - **观测**（运行）  
2. **Wiki**：阅读优先；编译/dead/lint **折叠**；页头强调 Issue→编译→页 闭环  
3. **Memory**：详情抽屉已做；页头强调 curated/ambient + 指向 Wiki  
4. **运行**：文案改为观测，不改路由  

刻意不做：合并 Wiki+Memory 单页、删掉运行入口、上云同步。

## 改动文件

- `Sidebar.tsx` section knowledge / observe  
- `WikiPage.tsx` bridge + ops fold  
- `MemoryPage.tsx` bridge  
- `RunsPage.tsx` 描述  
- `globals.css` knowledge-bridge / wiki-ops-fold  

## 证据

- typecheck web  
- 侧栏文案可见「知识」「观测」  
