# 下一阶段切片计划 · Phase E · 2026-07-27

> **方法：** Phase D 收官后，按既有 3 路审计（后端 / 前端 / Multica 交叉）默认开 **失败可解释 + 恢复纵深**  
> **北星：** 本地 Multica 控制台体验（知道为什么失败、知道下一步），非 daemon/云 1:1  
> **前置：** [queue-55-62-phase-d-closeout-2026-07-27.md](./queue-55-62-phase-d-closeout-2026-07-27.md) · [slice-plan-2026-07-27-phase-d.md](./slice-plan-2026-07-27-phase-d.md)  
> **编号：** 续接 Slice 62 → **63+**  
> **本阶段主题：** **失败可分类 → 用户可行动 → 等待/续聊可解释 → 轻量 lease 与可选 deferred**

---

## 0. 阶段判断

| 判断 | 说明 |
|---|---|
| 主航道 | **已可用**；D 已收一致性/运维半落地 |
| Phase A–D | **已合 main**（23–62） |
| 缺口性质 | 失败/卡死/续聊 **分类粗、动作弱**；Multica 最深差异在 taskfailure + lease，不在再堆页面 |
| 工程 | Slice Owner · 子代理实现 · unit + Playwright/API e2e · **main 直推** |

**刻意不做（仍有效）：** 云 webhook · Redis/多节点 · daemon 1:1 · 密钥入库/UI · 自造 agent loop · TipTap 全量 · Wiki 图谱 · 跨 Runtime Session 迁移 · Prometheus 全量 agent_error 指标 · Deferred **默认强制** auto-reassign

**过时勿再开：** Phase C/D 已交项；7/26 全量 gap 主体；B-04/05/07/08 等。

**学 Multica 裁剪：**

| 借 | 不做 |
|---|---|
| `taskfailure` 分层 + Classify 规则表精神 | 全量 `agent_error.*` + 云 metrics |
| force_fresh_session 用户旋钮 | 多 host claim |
| prepare_lease 时间戳 + 本地 sweeper | `FOR UPDATE SKIP LOCKED` 多进程 |
| deferred escalate **可选** | 静默默认改派 |

---

## 1. 四轨总览

```text
轨道 K 分类        轨道 A 可行动 UI       轨道 R 恢复旋钮           轨道 L 等待/lease
K1 failure 扩枚举  A1 失败 chip + 文案    R1 force_fresh API+UI     L1 waiting 进入时刻
K2 Classify 规则表 A2 Run/Inbox 主按钮    R2 poison/resume_miss 运营  L2 prepare_lease 轻量
                   A3（可选）父 run 摘要  R3 Deferred 可选升级（默认关）
```

**默认顺序（推荐 · 少翻车）：**

```text
K1+K2 → A1 → A2 → L1 → R1 → L2 → R2 → R3（可选）
```

即：

```text
63 → 64 → 65 → 66 → 67 → 68 → 69 → 70（可选）
```

- **63 先扩枚举 + Classify**：后端契约真源，后面 UI 都挂它。  
- **64 chip**：失败列表/详情一眼可行动。  
- **65 Inbox/Run CTA**：默认可行动收口（D 未做透）。  
- **66 waiting 进入时刻**：文案/排障准。  
- **67 force_fresh**：用户主动「不要 resume」。  
- **68 prepare_lease**：崩溃半 claim 更干净（本地版）。  
- **69 Ops 计数**：poison / resume_miss / deferred 可见。  
- **70 Deferred 升级**：**默认仍关**；Settings 一键建议值 + 可选 reassign 草稿。人可砍 70。

**可选加速（双会话）：**

```text
会话甲（后端）：63 → 66 → 67-API → 68 → 69
会话乙（前端）：64 → 65 → 67-UI
汇合：67 联调；70 单会话
```

**与 Phase F 关系：** 合并 Activity 时间线 / 流式气泡 **不进本阶段主列**；E 关刀后若演示要质感再开 F（见 §3）。

---

## 2. 切片明细（63–70）

### Slice 63 · failureReason 扩档 + Classify 规则表  
**轨：** K1+K2 · **厚度：** 中 · **端：** 后端（shared）

| | |
|---|---|
| **Must** | 扩展 `AgentRunFailureReason`（或等价共享枚举）：在现有 idle/tool/stale/exec/timeout 等基础上，补齐日用档如 **`auth_required` / `quota_exceeded` / `session_poisoned` / `cancelled` / `user_aborted`**（命名以 shared 为准，可微调）；抽出 `classifyFailure(error, hints?)` 规则表（字符串/模式 → reason）；`inferFailureReason` / stale-runs 写路径走 Classify；**单测**覆盖规则表（对齐 Multica Classify 精神，档位 ≤12） |
| **Out** | Prometheus；云侧全量 agent_error 树；改 UI chip（64） |
| **验收** | unit：样例错误串 → 期望 reason；typecheck shared+server；可选 e2e API 创建失败 run 读回 reason |
| **进度** | `slice63-failure-classify-impl-1.md` |

### Slice 64 · 失败 chip 与中文动作映射  
**轨：** A1 · **厚度：** 中 · **端：** 前端（+ shared 文案 map 可放 web/lib 或 shared）

| | |
|---|---|
| **Must** | Run 详情 / Runs 列表（至少一处主路径）展示 failure chip：可读标签 + **建议动作**（重试 / 检查登录 / 强制 fresh / 看超时设置）；颜色/variant 区分可重试 vs 需人；未知 reason 降级「执行失败」 |
| **Out** | 新失败页大改；全站每个 toast 重做 |
| **验收** | unit：reason → label/action 映射；e2e：失败 run 可见 chip 文案 |
| **进度** | `slice64-failure-chips-impl-1.md` |

### Slice 65 · Inbox / Run 默认可行动 CTA  
**轨：** A2 · **厚度：** 中 · **端：** 前端（少量 API 若缺 link 字段）

| | |
|---|---|
| **Must** | failed / waiting / deferred（若有）条目：**主按钮**直达 retry 或 run 详情或 issue；Inbox 默认筛选或空态强调「需处理」；与现有 inbox-prefs 对齐（不推翻 prefs） |
| **Out** | 细粒度 per-agent 订阅大系统；桌面系统通知桥（可后置） |
| **验收** | e2e：造 failed inbox 或 mock → 主 CTA 可点到目标；unit 轻测 CTA 选择函数 |
| **进度** | `slice65-inbox-run-cta-impl-1.md` |

### Slice 66 · `waiting_local` 进入时刻  
**轨：** L1 · **厚度：** 薄–中 · **端：** 后端（+ 前端展示一行）

| | |
|---|---|
| **Must** | 进入 `waiting_local_directory` 时写入 **`waitingLocalEnteredAt`（或等价列）**；迁移/兼容旧行 null；API 返回；Run UI / Ops 文案「已等待 Xs」用该字段而非瞎猜 |
| **Out** | 改 path-lock 语义；新等待状态机大类 |
| **验收** | unit：进入 waiting 写时间戳；e2e API 读回字段 |
| **进度** | `slice66-waiting-entered-at-impl-1.md` |

### Slice 67 · force_fresh_session 显式控制  
**轨：** R1 · **厚度：** 中 · **端：** 双端

| | |
|---|---|
| **Must** | retry/rerun（或 `POST /api/runs` 相关）支持 **`forceFresh: true`**；落库/消息可观测（如 sessionResumeStatus / 系统 note）；UI：Run 失败且 reason=session_poisoned 或用户勾选「强制新会话」；**不**把非 claude resume 矩阵翻 true |
| **Out** | 跨 runtime 迁 session；假 resume |
| **验收** | unit：forceFresh 跳过 resume 绑定；e2e API 或 UI 勾选路径 |
| **进度** | `slice67-force-fresh-impl-1.md` |

### Slice 68 · prepare_lease 轻量  
**轨：** L2 · **厚度：** 中 · **端：** 后端

| | |
|---|---|
| **Must** | claim 路径增加 **本地 prepare/lease 时间戳**（列名自洽，如 `prepareLeaseExpiresAt`）；sweeper：过期未进入稳定 running 的半 claim → fail 或回 queued（文档钉死一种）；注释对齐 Multica FailStale **精神**、单进程实现 |
| **Out** | 多 host / Redis / SKIP LOCKED |
| **验收** | unit：过期 lease 被收；正常 claim 不受损；e2e 或集成测 |
| **进度** | `slice68-prepare-lease-impl-1.md` |

### Slice 69 · Ops：poison / resume_miss / deferred 计数  
**轨：** R2 · **厚度：** 薄 · **端：** 后端（+ Settings/Ops 只读一行）

| | |
|---|---|
| **Must** | `ops-snapshot`（或等价）增加近 N 日/近 N 条：**sessionPoisoned 次数、resume_miss、deferred 未认领** 等可有则有；Settings Ops 卡只读展示 |
| **Out** | 大规模 BI；时序数据库 |
| **验收** | unit snapshot 字段；e2e GET ops 含键 |
| **进度** | `slice69-ops-resume-stats-impl-1.md` |

### Slice 70 · Deferred 可选升级（可选刀）  
**轨：** R3 · **厚度：** 中 · **端：** 后端（+ Settings 开关文案）

| | |
|---|---|
| **Must** | 保持 **默认不自动 reassign**；Settings/env 提供建议阈值与 **opt-in** `autoEscalate`（或复用 `MA_DEFERRED_*`）；开启后：超时未 claim → 写 inbox + 可选草稿 reassign（实现量控在「可演示 opt-in」） |
| **Out** | 默认开启；静默改派无痕迹 |
| **验收** | unit：默认关时无升级；opt-in 路径有事件/inbox；e2e 可选 |
| **进度** | `slice70-deferred-escalate-impl-1.md` |

---

## 3. 可选延伸（Phase F · 本阶段不默认排期）

| 方向 | 内容 | 何时开 |
|---|---|---|
| F1 | Issue 合并时间线（comment + activity + 关键 run） | 演示要「故事线」 |
| F2 | Activity WS invalidate | 与 F1 同开 |
| F3 | 流式 partial/tool 折叠再加深 | 盯 run 质感 |
| F4 | Tool 事件只读面板 | Hermes Registry 裁剪版 |

**选用启发式：**

| 场景 | 开 |
|---|---|
| 天天自用、少翻车 | **Phase E 全文（可砍 70）** |
| 演示临近 | E 63–65 + 可选 F1/F3 |
| 只要续聊旋钮 | 63 + 67 + 69 短列 |

---

## 4. 关刀与验收纪律

| 项 | 要求 |
|---|---|
| 每刀 | typecheck + 相关 unit + **≥1** Playwright 或 API e2e |
| 进度 | `app/.progress/sliceNN-*-impl-1.md` + closeout |
| Git | 默认可 **main 直推**；Conventional Commits |
| 禁止 | 装 resume；默认静默改派；密钥入库；灌上游全文 |
| 整队 | 69/70 后写 `queue-63-*-phase-e-closeout-*.md`，滚 CONTEXT + multica-gap |

---

## 5. 决策记录（开写时默认）

| 决策 | 默认 | 可改 |
|---|---|---|
| 阶段主题 | **失败可解释 + 恢复纵深** | 人可改以 F 为主菜 |
| 首刀 | **63 Classify + 枚举** | — |
| Resume 矩阵 | **仍诚实**；仅 force_fresh 用户旋钮 | 勿装会 |
| Deferred 升级 | **70 可选且默认关** | 人可砍整刀 |
| prepare_lease | **本地单进程轻量** | 不做多 host |
| Phase F | **不进 63–70 主列** | E 后另开 |

---

## 6. 一句话给下一 Owner

```text
Phase E：先让失败「说得出档位」（63–64），再让用户「点得到下一步」（65–67），
夹 waiting 时刻与本地 lease（66/68），Ops 能看见 poison/resume（69）。
Deferred 升级默认关（70 可选）。时间线/流式留给 Phase F。
开刀：验 Phase D closeout → 实现 Slice 63。
```

---

## 7. 相关路径

| 读什么 | 路径 |
|---|---|
| Phase D 关刀 | [queue-55-62-phase-d-closeout-2026-07-27.md](./queue-55-62-phase-d-closeout-2026-07-27.md) |
| Phase D 计划（E/F 草案出处） | [slice-plan-2026-07-27-phase-d.md](./slice-plan-2026-07-27-phase-d.md) §3 |
| 滚动差距表 | [multica-gap-2026-07-17.md](./multica-gap-2026-07-17.md) |
| Multica deep | [references/deep/multica.md](../../references/deep/multica.md) |
| 方位 | [CONTEXT.md](../../CONTEXT.md) |
| 工作流 | [docs/agents/workflow.md](../../docs/agents/workflow.md) |
