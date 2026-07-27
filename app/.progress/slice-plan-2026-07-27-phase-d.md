# 下一阶段切片计划 · Phase D · 2026-07-27

> **方法：** Phase C 收官后 3 路探索子代理（后端 / 前端 / Multica 交叉）合并  
> **北星：** 本地 Multica 控制台体验（日用顺、少翻车、可运营），非 daemon/云 1:1  
> **前置：** [queue-44-54-phase-c-closeout-2026-07-27.md](./queue-44-54-phase-c-closeout-2026-07-27.md) · [multica-gap-2026-07-17.md](./multica-gap-2026-07-17.md)  
> **编号：** 续接 Slice 54 → **55+**  
> **本阶段主题：** **一致性收口 → 运维安心 → 失败可解释（可选延伸）**

---

## 0. 阶段判断

| 判断 | 说明 |
|---|---|
| 主航道 | **已可用**（~90% 日用覆盖） |
| Phase A/B/C | **已合 main**（23–54） |
| 缺口性质 | 不再是「能不能用」，而是 **半落地收口 + 多 CLI 深度不均 + 运维最后一环** |
| 工程 | Slice Owner · 探索/实现子代理 · Playwright 关刀 · **main 直推** |

**刻意不做（仍有效）：** 云 webhook · Redis/多节点 · daemon 1:1 · 密钥入库/UI · 自造 agent loop · TipTap 全量 · Wiki 图谱大屏 · 跨 Runtime Session 迁移 · Multica Hub 三房间 · 大规模 BI · 全站 confirm/select **绝对扫零当 KPI**

**过时勿再开：** 7/26 全量 gap 的 S1–S12 / B-04/05/07/08 / F-02–07/10 / Phase C 44–54 已交项。以本文件 + closeout 残留为准。

**Phase C 明文残留（本阶段优先消）：**

| 残留 | 归入 |
|---|---|
| 全站裸 `confirm`/`alert` 未扫零 | D1 / Slice 56 |
| 非看板裸 `<select>` | D1 / Slice 59 |
| Web 未自动带 local token | D1 / Slice 58 |
| Resume 仅 claude-code（有意诚实） | 保持；加深解析见 D2，不装会 |
| 看板 isError 弱 / bulk 无 toast | D1 / Slice 55 |

---

## 1. 三轨总览

```text
轨道 C 一致性收口          轨道 O 运维安心            轨道 E 失败可解释（可选延伸）
C1 看板 Error + bulk 反馈  O1 SQLite 硬化            E1 failure taxonomy + Classify
C2 Confirm 扫荡（含派活）  O2 Ops backup/export      E2 失败 chip + force_fresh UI
C3 Web token 闭环          O3 Runtime usage 捕获均衡  E3 prepare_lease 轻量 / waiting 时刻
C4 Select 扫非看板日用页   （可挂 O3 后）              E4 合并 Activity 时间线（可挪 F）
C5 Chat/Issue 空错态对齐
```

**默认顺序（推荐 · 稳健日用）：**

```text
C1 → C2 → O1 → O2 → C3 → O3 → C4 → C5
```

即：

```text
55 → 56 → 57 → 58 → 59 → 60 → 61 → 62
```

- **C1 先开：** 首页信任，改动面小、感知大。  
- **C2 紧接：** 消廉价 browser 对话框；与派活 dirty 同刀或拆半。  
- **O1 薄刀穿插：** 降 `SQLITE_BUSY` 毛刺，可与前端刀分会话。  
- **O2 backup：** 可运营闭环；需确认默认备份目录与危险操作口径。  
- **C3 token：** 局域网才痛；默认 127 可后移，若人常用 `0.0.0.0` 则前移到 57 后。  
- **O3 Runtime：** 只加深 usage/tool/session **捕获**，**不**把 opencode/cursor resume 翻 true。  
- **C4/C5：** 一致性收尾；人可砍或并刀。  
- **E 轨默认不进本阶段主列**；Phase D 关刀后若失败/续聊仍痛再开 Phase E。

**可选加速（双会话）：**

```text
会话甲（后端）：57 → 58-backup → 60
会话乙（前端）：55 → 56 → 59 → 61 → 62
汇合：C3 token（59 前后联调）
```

---

## 2. 切片明细（55–62）

### Slice 55 · 看板诚实：ErrorState + bulk 反馈  
**轨：** C1 · **厚度：** 薄 · **端：** 前端

| | |
|---|---|
| **Must** | `KanbanBoard` 处理 `isError` → `ErrorState` + 重试；bulk status/assignee/delete：`onError` toast、success 摘要、`isPending` 禁用/文案 |
| **Out** | 看板视觉大改；部分成功复杂 UI；新 bulk API |
| **验收** | 断 API 时板不静默；bulk 失败有 toast；1 条 Playwright |
| **进度** | `slice55-board-error-bulk-impl-1.md` |

### Slice 56 · Confirm 扫荡 · 派活/删除主路径  
**轨：** C2 · **厚度：** 中 · **端：** 前端

| | |
|---|---|
| **Must** | 日用危险操作迁 `confirmDialog`：git dirty / QC·Chat 停 / Agents·Squads·Projects 删归档 / Memory 删 / Settings 清空·Wiki 重试 / Inbox 批量归档 / Runs 批量取消（按命中优先级扫） |
| **Out** | 全仓绝对零 `window.confirm`（低频页可列残留）；自研第二套 modal |
| **验收** | 派活 dirty + 至少 3 类删除无 browser confirm；focus trap/Esc 可用 |
| **进度** | `slice56-confirm-sweep-impl-1.md` |

### Slice 57 · SQLite 硬化  
**轨：** O1 · **厚度：** 薄 · **端：** 后端

| | |
|---|---|
| **Must** | `pragma busy_timeout`（可配，默认 5000）；文档化 WAL 假设；可选启动/关停 checkpoint；Ops/Settings 可读 DB 路径或 WAL 状态一行 |
| **Out** | 换 PG；多进程 writer；复杂连接池 |
| **验收** | unit + 启动烟测；并发写路径不因缺 timeout 即炸 |
| **进度** | `slice57-sqlite-harden-impl-1.md` |

### Slice 58 · Ops backup / 导出  
**轨：** O2 · **厚度：** 中 · **端：** 后端（+ 极薄 Settings 入口可选）

| | |
|---|---|
| **Must** | `POST /api/ops/backup`（sqlite `.backup()` 到可配目录）；`GET /api/ops/backups` 列表；默认路径与「不覆盖运行中 DB」安全说明 |
| **Out** | 一键 restore 裸挂 UI（restore 可仅 CLI/严确认后续刀）；打包整个 `wiki/` 大文件默认开 |
| **验收** | e2e：backup 文件可读；列表可见；失败有明确 code |
| **进度** | `slice58-ops-backup-impl-1.md` |

### Slice 59 · 局域网 token Web 闭环  
**轨：** C3 · **厚度：** 中 · **端：** 双端

| | |
|---|---|
| **Must** | Web `fetch`/WS 可注入 `X-MA-Token`（public env 或 dev 代理，**不写密钥表单落库**）；Settings 检测「是否要求 token / 当前是否带得上」说明；与 Slice 49 对齐 |
| **Out** | UI 存密钥到 DB；改 bind 默认值 |
| **验收** | 有 token 时非 loopback API 通；无 token 时错误可理解；文档一步 |
| **进度** | `slice59-web-token-impl-1.md` |

### Slice 60 · Runtime 捕获均衡（opencode / cursor 优先）  
**轨：** O3 · **厚度：** 中 · **端：** 后端

| | |
|---|---|
| **Must** | 统一验收表：usage / tool 事件 / providerSessionId 尽力捕获；analytics 可展示 capture 缺口（uncosted 诚实）；**supportsSessionResume 不因本刀翻 true** |
| **Out** | 假 resume；Pi 真执行；全 CLI 一次扫完（可只做 opencode+cursor） |
| **验收** | 契约测或 fixture：两 backend 至少 usage 或明确「不可解析」路径；矩阵文案仍诚实 |
| **进度** | `slice60-runtime-capture-impl-1.md` |

### Slice 61 · Select 扫非看板日用页  
**轨：** C4 · **厚度：** 中 · **端：** 前端

| | |
|---|---|
| **Must** | Chat / Runs / Inbox / Agents / Automation（+ 顺手 Project/Squad 表单）改用共用 `Select` 壳 |
| **Out** | radix combobox；外观大改版 |
| **验收** | 列残留清单；主路径无新增裸 select；轻烟测 |
| **进度** | `slice61-select-sweep-impl-1.md` |

### Slice 62 · Chat + Issue 空错态对齐  
**轨：** C5 · **厚度：** 中 · **端：** 前端

| | |
|---|---|
| **Must** | Chat threads/messages：Skeleton / ErrorState+重试 / 空态 CTA；Issue 详情与 SideSheet：「不存在/加载失败」+ 回看板；Usage 等误用 Empty 当 loading 顺手改（可半刀） |
| **Out** | Chat 协议重做；Linear 级 split view |
| **验收** | 断 API 时 Chat/Issue 有重试；1 条 Playwright |
| **进度** | `slice62-chat-issue-states-impl-1.md` |

---

## 3. 可选延伸（Phase E / F · 本阶段不默认排期）

### Phase E · 失败可解释 + 恢复纵深（建议 D 关刀后）

| 方向 | 内容 | 端 |
|---|---|---|
| E1 | `failureReason` 扩档 + Classify 规则表（Multica 精神裁剪） | 后端 |
| E2 | 失败 chip：可重试 / 需登录 / 毒会话 / 超时 | 前端 |
| E3 | `force_fresh` API+UI；`waiting_local` 进入时刻；prepare_lease 轻量 | 双端 |
| E4 | Deferred 可选升级（默认仍关） | 后端 |

### Phase F · 时间线与观测质感

| 方向 | 内容 | 端 |
|---|---|---|
| F1 | Issue 合并时间线（comment + activity + 关键 run） | 双端 |
| F2 | Activity WS invalidate | 前端 |
| F3 | 流式 partial/tool 折叠再加深 | 前端 |
| F4 | Tool 事件只读面板；Ops 加 poison/resume_miss 计数 | 双端 |

**选用启发式：**

| 场景 | 开 |
|---|---|
| 默认自用、Phase C 残留刺眼 | **Phase D 全文** |
| 天天翻车在失败/续聊 | D 中段后插 E，或 D 收官进 E |
| 演示要「故事线+流式」 | D 后 F1/F3 |
| 单人仅 127、不要 backup | 可砍 58、59；保留 55–57、60–62 |

---

## 4. 关刀与验收纪律

| 项 | 要求 |
|---|---|
| 每刀 | typecheck + 相关 unit + **≥1** Playwright 或 API e2e |
| 进度 | `app/.progress/sliceNN-*-impl-1.md` + closeout；intake 建议下一刀 |
| Git | 默认可 **main 直推**；Conventional Commits |
| 禁止 | 灌上游全文；无证据宣称完成；推翻宪法钉 |
| 整队 | 62 或人喊停后写 `queue-55-62-phase-d-closeout-*.md`，并滚 [multica-gap](./multica-gap-2026-07-17.md) 一行 |

---

## 5. 决策记录（开写时默认）

| 决策 | 默认 | 可改 |
|---|---|---|
| 阶段主题 | **一致性 + 运维安心** | 人可改以 E 为主菜 |
| 首刀 | **55 看板 Error + bulk** | — |
| Resume | **保持诚实矩阵**；60 只捕获 | 勿装会 |
| Backup | **允许本机目录 API**；restore 不进 58 | 人可禁 backup API |
| Token Web | **59 做注入，不落库** | 无 LAN 可砍/后移 |
| E/F | **不进 55–62 主列** | D 后另开计划 |

---

## 6. 一句话给下一 Owner

```text
Phase D：先消「半落地」摩擦（板错误、Confirm、Select、Chat/Issue 态），
夹 SQLite + backup 运维安心，再加深 Runtime 捕获与（可选）局域网 token。
失败 taxonomy / 合并时间线 / 流式大刀 → Phase E/F，别和收口搅在一锅。
开刀：验 Slice 54 closeout → 实现 55。
```

---

## 7. 相关路径

| 读什么 | 路径 |
|---|---|
| Phase C 关刀 | [queue-44-54-phase-c-closeout-2026-07-27.md](./queue-44-54-phase-c-closeout-2026-07-27.md) |
| 滚动差距表 | [multica-gap-2026-07-17.md](./multica-gap-2026-07-17.md) |
| 历史全量 gap（只读索引） | [gap-analysis-full-2026-07-26.md](./gap-analysis-full-2026-07-26.md) |
| 方位 | [CONTEXT.md](../../CONTEXT.md) |
| 工作流 | [docs/agents/workflow.md](../../docs/agents/workflow.md) |
