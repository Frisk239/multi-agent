# 下一阶段计划：Multica 体验诚实与多仓日用

Date: 2026-07-21  
Status: **进行中**（Wave A–B ✅ · **下一刀 Wave C/D P0–P1**）  
Code name: **UX Trust**（暂名）

> 依据：2026-07-21 三子代理硬缺口审计 + Multica 对照 + 本轮 F1–F8/F10 已交 · **P0/P1 体验缺口收口计划**。  
> 北星不变：本地 Multica **控制台体验**，非 daemon/云 1:1。  
> **实现计划（C/D）：** [docs/superpowers/plans/2026-07-21-ux-trust-wave-c-p0-p1.md](../../docs/superpowers/plans/2026-07-21-ux-trust-wave-c-p0-p1.md)

---

## 1. 阶段定位

| 维度 | 内容 |
|---|---|
| **上一阶段** | 主航道日用可用（S01–S12 + 补1–5 + 完成审计）→ UX gap **机制债**（F1–F8、F10：cwd 模型、硬闸、CTA、idle、Inbox…） |
| **本阶段** | 从「能跑」到「**跑在哪、敢信、多仓好用**」——对齐 Multica 日用信任感 |
| **成功一句话** | 用户派活后，清楚 agent **在哪个本机目录**干活；失败可解释可恢复；Chat/QC 也能进真仓；文案与闸一致 |

### 非目标（本阶段明确不做）

| 不做 | 原因 |
|---|---|
| Daemon / 「添加电脑」/ 多节点 | 宪法 |
| 云 webhook / Redis / 多租户 | 宪法 |
| Multica project_resource + 多 daemon 全量 | 单机用 `local_path` 够 |
| 密钥入库 / UI 写密钥 | ADR 0003 |
| Wiki 文件系统 per-project 大迁移 | 可二期；本阶段只「诚实标注 + 可选跳过」 |
| CLI session 真 resume（PriorWorkDir 全套） | 成本高；本阶段只目录级诚实与可选复用 |

---

## 2. 体验原则（拍板用）

迭代选型时优先满足：

1. **诚实优先于功能密度** — 能跑但说不清 cwd = 失信 > 少一个筛选器  
2. **默认隔离，真仓要显式** — 学 Multica execenv：空 workdir 默认；进用户仓必须用户选/绑  
3. **一条主路径可演示** — 每刀 Playwright：能指出「在哪跑 / 为何没跑 / 如何恢复」  
4. **Issue 路径先于 Chat 深造** — 看板派活是第一场景；Chat 绑仓是第二刀波次  
5. **旁路与主路径同闸** — QC / 自动化 / mention 不得比 Issue 指派更「假成功」  

---

## 3. 差距真源（本阶段 backlog 来源）

| 来源 | 用途 |
|---|---|
| 硬缺口 H1–H12（2026-07-21 审计） | 日用信任队列 |
| Multica 仍领先 6 条（chat 绑仓 / tool idle / path 锁 / …） | 对标优先级 |
| 旧 F 表 / live G 表 | **机制债已合的勿重复开工**；只取未收口余量 |

已收口（本阶段**不重做**）：F1–F8 机制、F10 Inbox 降噪、enqueue 硬闸、Runs CTA、Settings 行内 CTA、issue idle 30m…

---

## 4. 波次规划（建议 3 波 · 约 6–10 刀）

### Wave A — 派活诚实（P0 · 先做 · 约 2–3 刀）

**主题：** 消灭「跑绿了仓库没动」。

| 刀 | 切片 | 用户可感 | Multica 对齐 | 验收要点 |
|---|---|---|---|---|
| **A1** | **新建/看板绑项目 + cwd 预检** | 建 Issue 可选 project；无 path 红条「将在隔离目录」；无效 path 指派前可见 | 派活前知 WorkDir | Playwright：无 project 有隔离提示；有 path 不误导 |
| **A2** | **Run 落库 cwd/mode + UI 展示** | Runs/Issue 活迹一行：`项目本机 \| 隔离 \| 工作区` + path | 可审计「跑在哪」 | 详情页可见；失败文案可带 path |
| **A3** | **文案与闸对齐** | EnvBanner/Settings/QC：默认隔离会开工；仅 `MA_ISSUE_USE_WORKSPACE_CWD` 才 cwd 硬闸；QC 走 enqueue 硬闸 | 不打脸 | 首启文案自测 + QC 无 CLI 直接 skipped |

**Wave A 出口：** 用户能回答「这次 run 在哪」；看板新建不会默默空跑却以为改了业务仓。

---

### Wave B — 旁路与第二场景（P1 · 约 2–3 刀）

**主题：** Chat/QC/小队/mention 不再比 Issue 更「假」。

| 刀 | 切片 | 用户可感 | Multica 对齐 |
|---|---|---|---|
| **B1** | **Chat 绑 Project / localPath** | 会话头选项目 → 下一句 cwd=真仓；头栏显示 path | Chat + local_directory 日用 |
| **B2** | **QC 可选 project + 服务端硬闸** | 快派选项目；无 CLI 不排队 | 与 Issue 同闸 |
| **B3** | **静默点收口** | Squad 无 leader → 明确错误；mention toast 按 runId 成败；自动化 success 含 enqueue 结果 | 不静默 |

**Wave B 出口：** 聊代码 / 快派 / @ 委派与看板派活同一套「在哪跑、开没开工」语义。

---

### Wave C — 多仓韧性（P0–P1 · **下一默认队列**）

**主题：** 敢绑真仓并跑、敢长跑、skills 跟仓。  
**细则：** [2026-07-21-ux-trust-wave-c-p0-p1.md](../../docs/superpowers/plans/2026-07-21-ux-trust-wave-c-p0-p1.md)

| 刀 | 切片 | 优先级 | 用户可感 | Multica 对齐 |
|---|---|---|---|---|
| **C1** | **同 localPath 简易串行** | **P0** | 两 run 同 path → 后到排队；≤1 running 写真仓 | path mutex 精简版 |
| **C2** | **Tool-aware idle / ToolWatchdog** | **P0** | 长构建 tool 中不误杀；卡死 2h 人话失败 | Idle + ToolWatchdog |
| **C3** | **Skills 按 project 运营** | **P1** | 导入/列表可对 `project.localPath/.skills`；无 workspace 不挡用户级 | F9 收官 |

**Wave C 出口：** 小队同仓并行可预期；长任务少误杀；skills 跟仓。

### Wave D — 连续性与执行手感（P1 · C 后或可与 C3 并行）

| 刀 | 切片 | 优先级 | 用户可感 |
|---|---|---|---|
| **D1** | **Chat 流式 / 过程可感** | P1 | 思考中 progress + tool 名 / partial 文本 |
| **D2** | **隔离 workdir 复用叙事** | P1 | 同 issue 再执行明示沿用目录；可选清理 |
| **D3** | **Run tool 叙事加厚** | P1 | 轨迹 tool 摘要更好扫 |

**不进本阶段默认队列：** 首启向导、看板列表视图、通知偏好、Wiki per-project 根、CLI session 真 resume、用量真 token。

---

## 5. 切片厚度与工程约定

| 约定 | 说明 |
|---|---|
| 一刀 | 端到端可 demo + Playwright + progress 关刀 + main 直推 |
| 调研 | 默认可查 Multica deep/repos；窗内只留摘要 |
| 文档 | 每刀更新本文件「进度」表 + `CONTEXT.md` 方位 |
| 旧 gap | 实现后在 `ux-gap-multica-2026-07-21.md` 顶部加「滚动状态」或单独 `ux-hard-gap` 表 |

### 推荐开干顺序（自动迭代默认）

```
A1 → A2 → A3 → B1 → B2 → B3 ✅
→ C1 → C2 → C3 → D1 → D2 → D3
```

**C1 不得跳过**（真仓双写风险）。人可改 D 与 C3 相对顺序；**难逆架构 / 安全**仍须问人。

---

## 6. 阶段完成标准（Definition of Done）

### 6.1 Wave A/B（派活诚实）— 已基本达成

- [x] 看板新建 Issue 可关联 project；无/坏 path 有预检或明确隔离提示  
- [x] 任意 issue run 在 UI 可见 cwd mode + path（或明确「隔离」）  
- [x] EnvBanner / Settings / QC 文案与「默认隔离」一致；QC 与 Issue 同级 readiness 闸  
- [x] Chat 至少能绑一个 project.localPath 执行  
- [x] Squad 无 leader / mention 全 skip / automation enqueue skip **对用户可解释**  
- [ ] Playwright 有「多项目 path → run 展示正确 cwd」用例证据（可随 C1 补）

### 6.2 Wave C/D（韧性+手感）— 本阶段收官条件

- [x] 同 `project_local` 任意时刻 ≤1 running；等待可解释（C1）  
- [x] tool in-flight 用 tool idle 窗口；失败文案可区分 idle vs tool（C2）  
- [x] Skills 用户级不依赖 workspace；项目级可对 localPath（C3）  
- [x] Chat 执行中过程信息可持续更新（D1）  
- [x] Issue 隔离目录复用对用户可见（D2）  
- [ ] 每刀 progress + typecheck；C1/C2 有脚本或 Playwright 证据  

---

## 7. 进度表（开干后勾）

| 刀 | 状态 | progress | 备注 |
|---|---|---|---|
| A1 新建绑项目 + cwd 预检 | ✅ | `ux-trust-a1-new-issue-project-impl-1.md` | 看板新建 project + 隔离/本机/无效预检 |
| A2 run cwd 落库 + UI | ✅ | `ux-trust-a2-run-cwd-display-impl-1.md` | cwd_path/mode 落库 + 详情/列表展示 |
| A3 文案与 QC 闸对齐 | ✅ | `ux-trust-a3-copy-qc-gate-impl-1.md` | 默认隔离文案 + QC readiness 409 |
| B1 Chat 绑 Project | ✅ | `ux-trust-b1-chat-project-impl-1.md` | 会话头选项目 · exec project_local |
| B2 QC project + 硬闸 | ✅ | `ux-trust-b2-qc-project-impl-1.md` | projectId + cwd + UI 预检 |
| B3 静默点收口 | ✅ | `ux-trust-b3-silent-points-impl-1.md` | no_leader / mention toast / auto enqueue |
| **C1** 同 path 串行 | ✅ | `ux-trust-c1-path-serial-impl-1.md` | 仅 project_local；queued 等待不假失败 |
| **C2** tool idle/watchdog | ✅ | `ux-trust-c2-tool-watchdog-impl-1.md` | 默认 tool 2h / idle 30m |
| **C3** skills per-project | ✅ | `ux-trust-c3-skills-project-impl-1.md` | user/workspace/project 三态 |
| **D1** Chat 过程可感 | ✅ | `ux-trust-d1-chat-live-impl-1.md` | progress + tool 名 / partial |
| **D2** workdir 复用叙事 | ✅ | `ux-trust-d2-workdir-reuse-impl-1.md` | 沿用隔离目录文案 |
| **D3** tool 叙事加厚 | **pending · 下一刀** | | Run 时间线 |

---

## 8. 与历史文档关系

| 文档 | 关系 |
|---|---|
| `local-multica-completion-audit-2026-07-19.md` | **主航道完成态仍成立**；本阶段是体验加深，不是「未完成 MVP」 |
| `ux-gap-multica-2026-07-21.md` | F 表机制债多数已合；P0/P1 余量见 C/D 计划 |
| `multica-gap-live-*.md` | UI 对标可继续滚动；与本计划并行，不互相挡 |
| `docs/superpowers/plans/2026-07-21-ux-trust-wave-a.md` | Wave A 实现计划（已完成） |
| `docs/superpowers/plans/2026-07-21-ux-trust-wave-c-p0-p1.md` | **Wave C/D 实现计划（当前）** |
| `CONTEXT.md` | 方位指针指向本计划 |

---

## 9. 给下一任 Slice Owner 的一句话

> **下一刀 C1：** 同 `project.localPath` 同时只许一个 running——消灭真仓双写；再 C2 tool watchdog，然后 C3 / D 手感。  
> 计划全文：`docs/superpowers/plans/2026-07-21-ux-trust-wave-c-p0-p1.md`。
