# UX Deep Slices — 厚切片阶段计划

> **性质：** 对标 Multica 后仍必须做、但**不是 UI 薄刀**的四条产品债。  
> **前序已合：** UX Trust A–D · Day-0 · P2 可交付子集（列表视图 / 通知偏好 / Chat partial / `MA_WIKI_DIR`）。  
> **工程：** Slice Owner · 默认可 main 直推 · 一刀一端到端可 demo + typecheck + progress · 难逆项先 ADR。  
> **Phase 真源：** `app/.progress/phase-ux-deep-2026-07-22.md`

**Goal:** 把「session 连续 / 看板手动序 / 多仓 Wiki / 用量与思考档」从口头债变成**可排期、可验收、可降级**的切片地图。

**产品边界（不变）：** 纯本地 · 不自造 agent loop · 不 daemon 1:1 · 密钥不落库。

---

## 0. 总览与默认顺序

| ID | 切片 | 厚度 | 建议优先级 | 估厚 | 风险 |
|---|---|---|---|---|---|
| **DS1** | CLI **真 session resume**（PriorSession + poison） | **最厚** | P1 产品深度 | 2–4 刀 | 高（按 runtime 分叉） |
| **DS2** | 看板 **手动排序**（position + 拖拽持久化） | 中 | P1 体验 | 1–2 刀 | 中 |
| **DS3** | Wiki **按 project 根**（轻量分根，非全量迁移神话） | 厚 | P1 多仓知识 | 2–3 刀 | 高（数据布局） |
| **DS4** | **用量 Token 尽力** + Agent **thinking level** | 中 | P1 控制台完整感 | 1–2 刀 | 中（CLI 能力差） |

**推荐开干顺序（自动迭代默认）：**

```
DS2 手动排序（快收益、触点清晰）
  → DS4 thinking + token 尽力（agent/runtime 已有 model）
  → DS1 session resume（先调研+claude-only MVP）
  → DS3 Wiki per-project（最后；需 ADR + 迁移策略）
```

**原则：**

1. **先可演示、后完美** — 每条 Deep Slice 允许 MVP 降级写进 Out。  
2. **学 Multica 语义，不抄 daemon 进程模型** — file:line 只进调研摘要。  
3. **DS1 / DS3 开干前写短 ADR**（难逆）；DS2 / DS4 短对齐即可。  
4. **禁止**把「云用量账单」「多机 daemon session」写成必须还清的债。

---

## DS1 — CLI 真 Session Resume

### 用户故事

同 Issue / 同 Chat thread **再执行或下一轮**时，在**同一 CLI 会话上下文**上续跑（工具历史、模型上下文），而不只是「同目录 + prompt 塞历史」。

### Multica 对照（调研入口，实现窗只留摘要）

| 概念 | 位置（upstream） |
|---|---|
| `PriorWorkDir` / `PriorSessionID` | `daemon/types.go` · claim 响应 |
| poison / resume-unsafe | `daemon/poisoned*.go` · `classifyResumeUnsafeTimeout` |
| workdir + session 复用 | `handler/daemon.go` claim · `service/task.go` Rerun |
| 本仓已有 | 按 issue 稳定 **隔离 path**（D2）；**无** provider session id 落库/回传 |

### 本仓设计拍板（MVP）

| 项 | 选择 |
|---|---|
| 范围 MVP | **优先 claude-code**（stream-json 有 `session_id`）；cursor 次之；opencode **诚实降级**（仅 workdir） |
| 落库 | `agent_runs.provider_session_id`（可空）；issue/chat 维度「最近可 resume 的 session」视图或字段 |
| 触发 | 同 issue 再执行 / 同 chat thread 下一 run：若 session 未 poison 且 runtime+model 匹配 → 传 resume 旗标给 backend |
| poison | 失败文案含 prompt too long / 明确 conversation corrupt → 标 `session_poisoned`，下次强制 fresh |
| Prompt | resume 时 **少塞或不塞** 全量 chat history（避免双倍上下文）；仍可注「已 resume session」 |
| UI | Run 详情：`session: abc… · 已复用 / 新鲜 / 已中毒放弃` |

### 建议拆刀

| 子刀 | 内容 | Demo |
|---|---|---|
| **DS1.0 调研** | 各 RuntimeBackend 是否暴露 session id / resume CLI 旗标；写 `app/.progress/ds1-session-resume-research.md` + ADR 草稿 | 结论表 + 推荐 MVP |
| **DS1.1 落库 + 解析** | claude stream-json 抓 `session_id` 写入 run；API 暴露 | 详情可见 session |
| **DS1.2 resume 路径** | 再执行/chat 下一轮传 resume；失败 poison 标记 | 同 issue 二次 run 日志见 resume |
| **DS1.3 UI + 降级** | 其它 runtime 文案；Settings 说明 | 全 runtime 不谎称 resume |

### Out（本阶段）

- 跨 runtime 迁移 session  
- Multica 全套 chat IM channel session  
- 自动 retry 策略全集  

### 验收 DoD（阶段）

- [ ] 至少 **一种** runtime 端到端 resume 可 demo  
- [ ] poison 后强制 fresh，有人话  
- [ ] 无 resume 能力的 runtime **不伪造**  
- [ ] ADR：`docs/adr/000x-cli-session-resume.md`  

---

## DS2 — 看板手动排序

### 用户故事

在看板**同一列内**拖拽 Issue 调整顺序，刷新后顺序仍在；列表视图可按手动序或更新时间切换。

### Multica 对照

- `issue.position` + `issueposition.NextTopPosition`（`service/issue.go`）  
- 同 status 列内排序；并发 best-effort  

### 本仓现状

- DB **已有** `issues.position`（schema）  
- 拖拽目前主要用于 **改 status**（跨列），**未**持久化列内序  

### 设计拍板

| 项 | 选择 |
|---|---|
| 排序键 | 现有 `position: real`；同 `status` 内升序展示 |
| 新建 | 插入到列顶：`min(position)-1` 或 `max+1`（二选一写死并测） |
| 拖拽 | 同列 reordering：源/目标 index → 重算相邻 position（或整列重编号薄方案） |
| API | `PATCH /api/issues/:id` 已有字段则扩 `position`；或 `POST /api/issues/reorder` `{ status, orderedIds[] }`（**推荐整列 ids**，实现简单） |
| 列表视图 | `?view=list&sort=manual|updated`（默认 updated 或 manual 可配置） |
| 跨列 | 改 status 时 position = 目标列顶/底（与 Multica 类似） |

### 建议拆刀

| 子刀 | 内容 |
|---|---|
| **DS2.1 API** | reorder 端点 + 列表/看板 query `ORDER BY position` |
| **DS2.2 看板 DnD** | 同列拖拽落库；跨列 status+position |
| **DS2.3 列表 sort** | 与 `view=list` 联动 |

### Out

- 多维自定义字段排序  
- 完美无冲突 CRDT position  

### DoD

- [ ] 同列拖两张卡，刷新后顺序不变  
- [ ] 新建 issue 出现在可预期位置  
- [ ] Playwright 或脚本：reorder API 后 GET 顺序一致  

---

## DS3 — Wiki 按 Project 根（轻量分根）

### 用户故事

绑定了 `project.localPath` 的 Issue ingest 时，Wiki 写入 **该项目下的 wiki/**（或 `localPath` 旁约定目录），浏览时可按项目切换根；**未绑 project** 仍走全局/workspace wiki（现行为）。

### 为何厚

- 读写路径、ingest job、AGENTS bridge、index/log、query 引用全部假设**单根**  
- 错误做法：一次搬成「完全 Multica 式多 resource」— 超出本地宪法与工期  

### 设计拍板（**轻量**，须 ADR）

| 项 | 选择 |
|---|---|
| 目录约定 | `project.localPath/wiki/`（与现 `getWikiDir` 结构相同：index/log/raw/pages） |
| 解析 | `resolveWikiDir({ projectId? })`：有 project 且 localPath 有效 → 项目 wiki；否则 `MA_WIKI_DIR` / workspace / cwd（现 P2-D） |
| Ingest | job 带 `projectId`（issue 上已有则继承） |
| UI | Wiki 页项目选择器 + 当前根横幅（扩展现有 meta） |
| 迁移 | **不自动搬**历史页；提供「从全局复制到项目」可选工具或文档 |
| Memory | **本阶段仍全局**（另债）；只动 Wiki 文件根 |

### 建议拆刀

| 子刀 | 内容 |
|---|---|
| **DS3.0 ADR** | 目录约定、回退、与 AGENTS bridge 关系 |
| **DS3.1 resolve + meta** | API 按 project 返回 root；写路径走 resolve |
| **DS3.2 ingest** | job/project 贯通 |
| **DS3.3 UI** | 项目切换 + 空态说明 |

### Out

- Memory/pgvector 按项目分库  
- 跨项目 wiki 联合检索 MVP 可不做  
- 自动迁移全部历史全局 wiki  

### DoD

- [ ] 两项目各 ingest 一页，磁盘落在各自 `localPath/wiki`  
- [ ] 切换项目浏览不串页  
- [ ] 无 project 的 issue 仍进全局 wiki  
- [ ] ADR 合 main  

---

## DS4 — 用量 Token 尽力 + Thinking Level

### 用户故事

1. **用量：** 在 CLI 能给出时展示 input/output token（或 cache）；不能则保持诚实空态。  
2. **Thinking：** Agent 可配置 thinking/effort 档，并传入支持的 backend。

### Multica 对照

- Agent `thinking_level` + 按 model 校验（`pkg/agent/thinking.go` 等）  
- 云端 token KPI；本仓 Usage 页已有 **空位诚实文案**  

### 本仓现状

- `agents.model` 已有；Usage KPI `tokensInput/Output: null`  
- stream-json 部分 runtime 的 `result` 行可能含 usage — **需 DS4.0 实测**  

### 设计拍板

| 项 | 选择 |
|---|---|
| Token | `agent_runs` 增 `tokens_in` / `tokens_out`（可空）；worker 从 backend result 解析；`/api/usage` 聚合非空 |
| Thinking | `agents.thinking_level` text 可空；shared zod；Agent 设置 UI select（runtime 相关选项可先静态表） |
| 传递 | `ExecutionInput.thinkingLevel`；claude/cursor/opencode **能传则传，不能则忽略并 log** |
| UI | Usage 页：有数据出数，全 null 仍显示现「CLI 无账单」；Agent 详情设置 Tab |

### 建议拆刀

| 子刀 | 内容 |
|---|---|
| **DS4.0 探针** | 各 CLI 是否输出 usage / thinking 旗标 → 短 research progress |
| **DS4.1 token 落库+Usage** | 解析 + API + 页 |
| **DS4.2 thinking 字段+UI+backend** | 按探针结果接线 |

### Out

- 美元计费、云账单同步  
- 全 provider 完美 thinking 枚举（Codex catalog 级）  

### DoD

- [ ] 至少一种 runtime 跑完后 Usage 或 Run 详情可见 token（若 CLI 提供）  
- [ ] Agent 可存 thinking_level 并出现在下一次 execute 参数中  
- [ ] 无能力时 UI 不谎报数字  

---

## 阶段依赖与风险

```
DS2 ──独立──▶ 可先合
DS4 ──依赖 runtime 探针──▶ 可与 DS2 并行
DS1 ──依赖 backend 能力──▶ 建议 DS4.0 后做 claude MVP
DS3 ──ADR + 写路径──▶ 建议其它稳定后再动
```

| 风险 | 缓解 |
|---|---|
| Resume 各 CLI 行为不一 | runtime 矩阵表；默认 fresh |
| 分根后 AGENTS/wiki bridge 指错仓 | resolve 与 run cwd 同源；单测双 project |
| position 并发碰撞 | 整列 reorder API；UI 容忍 |
| Token 永远 null | 保持诚实；不挡其它 KPI |

---

## 会话切分建议

| 会话 | 内容 |
|---|---|
| 1 | **DS2.1–2.2** 手动排序（可含 2.3） |
| 2 | **DS4.0 + 4.1** token |
| 3 | **DS4.2** thinking |
| 4 | **DS1.0** 调研 + ADR |
| 5–6 | **DS1.1–1.3** claude resume MVP |
| 7–8 | **DS3** ADR + resolve + ingest + UI |

---

## 关刀与文档

| 产物 | 路径 |
|---|---|
| 阶段滚动 | `app/.progress/phase-ux-deep-2026-07-22.md` |
| 调研 | `app/.progress/ds1-session-resume-research.md` 等 |
| ADR | `docs/adr/000x-*.md`（DS1/DS3） |
| 每刀 progress | `app/.progress/dsN-*-impl-1.md` |
| 方位 | `CONTEXT.md` 指针本计划 |

---

## 一句话给下一任 Slice Owner

> 深债四条已入地图：**先 DS2 排序赚手感，再 DS4 用量/thinking，然后 DS1 claude resume MVP，最后 DS3 Wiki 分根（必 ADR）**。不要一上来啃 resume 全 runtime。
