# Phase G 完整切片计划 · 2026-07-29

> **方法**: Phase F 收官后开 Phase G（健壮性 → 日用手感 → 纵深）  
> **北星**: 纯本地 Multica 控制台体验（日常可用、少翻车），**不做**云 webhook / Redis / daemon 1:1 / 密钥入库  
> **工程**: Slice Owner · 子代理实现 · Playwright 关刀 · main 直推  
> **状态**: Phase F 71-73 已收官，Phase G 健壮性已落地 slice75-process-lifecycle / slice24-memory-breaker / slice25-subagent-boundary / slice26-ws-subscribe / slice27-feel / slice28-model-rates / slice29-virtual-list / slice30-agent-templates / slice31-wiki-compound / slice32-issue-sheet

## 残留债清单（Phase G 真正可开刀点）

| ID | 主题 | 现状 | 参考 | 优先级 | 厚度 | 备注 |
|-----|------|------|------|--------|------|------|
| **R4** | mention 闭环完整性 | `comment-trigger.ts` + `notifySquadEscalated` 仅发 note，未全 WS 广播 | Multica comment-trigger + squad_member | **P1** | 中 | `orchestration/inbox-writer.ts:325` |
| **U4** | Onboarding Wizard 全流程 | 仅卡片+部分 wizard，首页无自动首启 | Multica onboarding | **P0** | 低 | `OnboardingWizard.tsx` |
| **U5** | Issue List View 完整切换 + 虚拟化 | KanbanBoard 为主，ListView 仅部分集成，无排序/分组/虚拟滚动 | Multica packages/views/issues | **P1** | 中 | `IssueListView.tsx` |
| **U6** | 密度控制 + 暗色一致性 + 窄屏响应 | globals.css + useDensity 基础，但边角暗色、骨架屏不全、1024px 以下卡 | Multica packages/ui/styles | **P1** | 低-中 | `globals.css` |
| **U7** | 空态/引导 + 骨架屏信任感 | EmptyState 基础，但部分页面残留「暂无数据」 | Multica packages/views/common | **P1** | 低 | `EmptyState.tsx` |
| **U8** | 键盘流 + CmdK 一致性 | CommandPalette 已实现，但覆盖广度不够 | Multica packages/core/shortcuts | **P1** | 低 | `CommandPalette.tsx` |
| **U9** | Error 可解释 + CTA + 恢复路径 | ErrorState + failure chips 已好，但 CTA 在 Runs/Chat 页语义模糊 | Multica packages/core/diagnostics | **P2** | 低 | `error.tsx` |

## 推荐 Phase G 最终切片清单（可直接开刀）

**默认顺序（A）**（R 刀优先，不后置）：

1. **R4 · mention 闭环完整性**（P1，中厚） — 后端驱动，Multica 核心闭环补齐
2. **U4 · Onboarding Wizard 全流程**（P0，低） — 高感知新用户第一印象
3. **U5 · Issue List View 完整切换 + 虚拟化**（P1，中） — 列表 vs 看板切换痛点
4. **U6 · 密度控制 + 暗色一致性 + 窄屏响应**（P1，低-中） — 手感质变
5. **U7 · 空态/引导 + 骨架屏信任感**（P1，低） — 信任感闭环
6. **R5 · failureReason 重试策略**（P2，薄） — 后端契约统一
7. **U8 · 键盘流 + CmdK 一致性**（P1，低） — 重度用户流畅度
8. **R6 · prepare_lease + stale-runs 一致性**（P2，薄） — 运维刚需
9. **U9 · Error 可解释 + CTA + 恢复路径**（P2，低） — 信任感

## 每个刀的 Must/Out 模板（直接复制给 /slice-owner）

```
Slice X · [主题] · intake

**North Star**: [北星一句话]
**Must**:
- [1]
- [2]
**Out**:
- [1]
- [2]
**Seams**:
- server/src/orchestration/comment-trigger.ts
- web/components/OnboardingWizard.tsx
**Acceptance**: unit + Playwright path + main push
**刻意不做**: 云 webhook / 密钥入库
```

## 阶段启动提示词（复制即用）

### A. 给 `/slice-owner` 的完整 Goal（推荐）

```
你是本仓 Slice Owner。启动 Phase G 残留波次（2026-07-29 计划）。

先读再动手（按序）：
1. AGENTS.md（工程模式 · main 直推 · 宪法钉）
2. CONTEXT.md（当前方位）
3. app/.progress/phase-g-plan-2026-07-29.md（本阶段真源）
4. app/.progress/multica-gap-2026-07-17.md + app/.progress/slice75-process-lifecycle-impl-1.md（上一刀）
5. 必要时对照 references/deep/multica.md（只取摘要 + file:line，不灌源码）

阶段判断：
- Phase F 71–73 已收官
- Phase G 早期条目（23–32 / 75 等）多数已落地，勿重做已关刀
- 本波只做 phase-g-plan 残留债：R4 mention 闭环 · U4 Onboarding · U5 Issue List View · U6 密度/暗色/窄屏 · U7 空态/骨架 · U8 CmdK · R5 failure 重试 · R6 lease/stale · U9 Error CTA

默认顺序 A（可跳但需写进 closeout 理由）：
R4 → U4 → U5 → U6 → U7 → R5 → U8 → R6 → U9

工作方式：
- 短对齐 → 探索/实现优先派子代理 → 你做路径验收
- 每刀：Must/Out 写清 → unit + Playwright/e2e → closeout 写 app/.progress/ → commit + push origin main
- 一刀一端到端可演示；窗满 /handoff

铁律：
- 纯本地；无 Redis/多节点/云 webhook
- 不自造 agent loop；密钥不落库；不改 references/repos
- 不做：富文本全量、Wiki 图谱大屏、daemon 1:1、大规模 BI
- 失败如实记；无证据不宣称完成

首刀默认：R4 mention 闭环完整性（comment-trigger / inbox / activity / WS）。
若首刀调研发现已够，则改 U4 Onboarding，并在 closeout 记切换理由。
开刀前先写 intake，再实现。
```

### B. 更短版（会话已热、直接续作）

```
按 app/.progress/phase-g-plan-2026-07-29.md 跑 Phase G 残留波次。
默认 R4→U4→U5…；已关刀不重做。Slice Owner：子代理实现 + Playwright 关刀 + main 直推。
宪法钉：纯本地、无密钥入库、无 daemon 1:1。先 intake 首刀 R4 mention 闭环，不够再切 U4 Onboarding。
```

### C. 人机短对齐用（你想先拍板时）

```
Phase G 残留波次启动。计划：app/.progress/phase-g-plan-2026-07-29.md
默认首刀 R4 mention 闭环；备选 U4 Onboarding / U5 List View。
是否改向？不改则按顺序 A 自动迭代到关刀。
```

---

**真源文件**：`app/.progress/phase-g-plan-2026-07-29.md`