# ADR 0005 — Wiki 按 Project 轻量分根

- **Status:** Accepted  
- **Date:** 2026-07-22  
- **Deciders:** Slice Owner（UX Deep DS3）  
- **Refs:** `docs/superpowers/plans/2026-07-22-ux-deep-slices.md` §DS3 · P2-D `MA_WIKI_DIR`

## Context

本仓 Wiki 一直是**单根**：`MA_WIKI_DIR` > `workspace/wiki` > `cwd/wiki`。  
Issue 可绑 `project.localPath`，但 ingest / 浏览**不**进该仓，多项目知识串在一处。

Multica 侧偏多资源/多仓知识；本仓宪法要求**纯本地、轻量**，禁止「全量自动迁移历史 wiki」神话。

## Decision

### 1. 目录约定

| 模式 | 路径 |
|---|---|
| **project** | `{project.localPath}/wiki/`（结构同现：`index.md` `log.md` `raw/` `*.md`） |
| **global** | 现逻辑：`MA_WIKI_DIR` > `{workspace}/wiki` > `{cwd}/wiki` |

### 2. 解析 `resolveWikiDir`

| 输入 | 结果 |
|---|---|
| 有效 `projectLocalPath`（绝对路径且为目录） | `source=project`，path=`localPath/wiki` |
| 无 project / 路径无效 | **global**（现 `getWikiDirSource`） |
| 仅 `projectId` | 查 `projects.localPath` 再上两条 |

**浏览 API：** 可选 `?projectId=`；缺省 = global。  
**Ingest：** 从 issue 的 `projectId` 解析；无 project 或路径无效 → global。

### 3. 范围（本刀）

| 做 | 不做 |
|---|---|
| store / list / read / write / index / log / raw 支持指定根 | 自动迁移全局历史页到项目 |
| ingest 按 issue.project 写对应根 | Memory 按项目分库 |
| meta `perProject: true` + 当前根说明 | 跨项目联合检索 |
| UI 项目选择器 + 横幅 | 强制每 project 都有 wiki |
| 项目根 ingest 后 **尽力** 更新该 project 下 `AGENTS.md` managed 块（若可写） | 改 workspace 宪法与 project 的复杂同步策略 |

### 4. AGENTS bridge

- **Global ingest：** 仍更新 workspace（或 cwd）`AGENTS.md`（现行为）。  
- **Project ingest：** 额外/改为更新 `{localPath}/AGENTS.md` 的 MA-WIKI 块（页面列表来自该 project wiki）。  
- Runtime 加载仍以 workspace `AGENTS.md` 为主（既有）；project 块供该仓 CLI 使用。

### 5. 密钥 / 产物

- 不写密钥。  
- `wiki/` 运行产物仍勿 commit；project 下 `wiki/` 同理 gitignore 由用户仓自理。

## Consequences

### Positive

- 绑 project 的 Issue 沉淀落在对应代码仓旁  
- 浏览可切换根，不串页  
- 无迁移风险：旧全局页保留

### Trade-offs

- 同一 slug 可在不同根各有一页（预期）  
- 无 project 的 issue 仍进全局  
- health/lint/query 默认当前所选根，不跨根

## Alternatives

| 方案 | 未选原因 |
|---|---|
| 一律 `MA_WIKI_DIR/projects/<id>/` | 与「仓旁 wiki」产品感弱 |
| 全量搬迁 + 重写 index | 过厚、易毁数据 |
| Memory 一并分根 | 另债 |

## Implementation notes

- `store.ts`：`resolveWikiDir` + 读写 API 带 `WikiRootOpts`  
- `ingestIssue` 解析 issue→project  
- `GET /api/wiki/meta|pages|…?projectId=`  
- UI：`?projectId=` 与选择器  
