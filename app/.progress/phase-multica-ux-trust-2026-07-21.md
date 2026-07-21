# 下一阶段计划：Multica 体验诚实与多仓日用

Date: 2026-07-21  
Status: **进行中**（Wave A ✅ · B1 ✅）  
Code name: **UX Trust**（暂名）

> 依据：2026-07-21 三子代理硬缺口审计 + Multica 对照 + 本轮 F1–F8/F10 已交。  
> 北星不变：本地 Multica **控制台体验**，非 daemon/云 1:1。

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

### Wave C — 多仓韧性与深度（P1–P2 · 约 2–3 刀 · 可穿插）

**主题：** 更接近 Multica 的「敢并跑、敢长跑、上下文对仓」。

| 刀 | 切片 | 用户可感 | Multica 对齐 |
|---|---|---|---|
| **C1** | **同 localPath 简易串行** | 两 run 同 path → 排队/提示占用，不双写互踩 | path mutex 精简版 |
| **C2** | **Tool-aware idle / ToolWatchdog** | 长构建有 tool 事件不误杀；真卡死 2h 人话失败 | Idle + ToolWatchdog |
| **C3** | **Skills 按 project 运营** | 导入/列表可对 `project.localPath/.skills`；无 workspace 不挡用户级 | F9 收官 |

**可选延后（不进默认队列）：** Wiki per-project 根、CLI session resume、通知偏好 UI、opencode 流解析加固。

**Wave C 出口：** 小队同仓并行可预期；长任务少误杀；skills 跟仓。

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
A1 → A2 → A3 → B1 → B2 → B3 → C1 → C2 → C3
```

人可随时否决/改序；**难逆架构 / 安全**仍须问人。

---

## 6. 阶段完成标准（Definition of Done）

同时满足即可宣称 **UX Trust 阶段收官**（可再开下一阶段）：

- [x] 看板新建 Issue 可关联 project；无/坏 path 有预检或明确隔离提示  
- [x] 任意 issue run 在 UI 可见 cwd mode + path（或明确「隔离」）  
- [x] EnvBanner / Settings / QC 文案与「默认隔离」一致；QC 与 Issue 同级 readiness 闸  
- [x] Chat 至少能绑一个 project.localPath 执行  
- [ ] Squad 无 leader / mention 全 skip / automation enqueue skip **对用户可解释**  
- [ ] Playwright 有「多项目 path → run 展示正确 cwd」用例证据  
- [ ] 本文件进度表 Wave A/B 全 ✅（Wave C 至少 C1 或书面降级说明）

---

## 7. 进度表（开干后勾）

| 刀 | 状态 | progress | 备注 |
|---|---|---|---|
| A1 新建绑项目 + cwd 预检 | ✅ | `ux-trust-a1-new-issue-project-impl-1.md` | 看板新建 project + 隔离/本机/无效预检 |
| A2 run cwd 落库 + UI | ✅ | `ux-trust-a2-run-cwd-display-impl-1.md` | cwd_path/mode 落库 + 详情/列表展示 |
| A3 文案与 QC 闸对齐 | ✅ | `ux-trust-a3-copy-qc-gate-impl-1.md` | 默认隔离文案 + QC readiness 409 |
| B1 Chat 绑 Project | ✅ | `ux-trust-b1-chat-project-impl-1.md` | 会话头选项目 · exec project_local |
| B2 QC project + 硬闸 | pending | | |
| B3 静默点收口 | pending | | |
| C1 同 path 串行 | pending | | |
| C2 tool idle/watchdog | pending | | |
| C3 skills per-project | pending | | |

---

## 8. 与历史文档关系

| 文档 | 关系 |
|---|---|
| `local-multica-completion-audit-2026-07-19.md` | **主航道完成态仍成立**；本阶段是体验加深，不是「未完成 MVP」 |
| `ux-gap-multica-2026-07-21.md` | F 表机制债多数已合；本计划用 **H\* / A–C 波次** 替代未更新的 executive summary |
| `multica-gap-live-*.md` | UI 对标可继续滚动；与本计划并行，不互相挡 |
| `CONTEXT.md` | 方位指针指向本计划 |

---

## 9. 给下一任 Slice Owner 的一句话

> 先做 **A1→A2**：让用户永远知道 agent 在哪干活；再做 **B1 Chat 绑仓** 追 Multica 第二场景；旁路假成功（QC/小队/mention）夹在中间收掉。
