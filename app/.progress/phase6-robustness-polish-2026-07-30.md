# Phase 6 — 健壮性深化 + 前端精炼 + Wiki/Memory UI 闭环

**日期**：2026-07-30  
**状态**：待启动（Slice Owner 模式）  
**北星**：本地 Multica 控制台手感更 premium + 少翻车 + 运维闭环更完整（daily-usable 再深一层）  
**目标**：把子代理分析中剩余开放硬缺口（a11y/UX、wiki project roots、run observability、memory breaker UI、vector health probe、shared types 收紧、E2E 扩展等）落地，不重做已关刀项。

## 工程模式
- **Slice Owner**（本人窗：选题拍板 → 派 explore/plan 子代理 → 实现子代理 → Playwright 关刀 → main 直推）
- 每刀必须写 **Must / Out** → 单元测试 + Playwright → closeout 写 progress
- 优先级（ROI 排序）：F2/A11y > Wiki project roots > Run observability > Memory UI > Vector health probe > E2E 扩展 > Shared types 收紧

## 详细任务（Must/Out）

### 1. Frontend Polish & A11y 闭环（最高 ROI 快速交付）
**Must**
- CommandPalette / mention-chips / shortcuts.ts 扩展全键盘 + focus traps + screen-reader ARIA
- Issue Sheet 增加 storyline summary + 失败主 CTA（F2）
- HelperRail 与 Chat 关键路径 CTA 对齐（F5）
- Error boundaries + loading skeletons 再深（hydration 优化）
**Out**（可选后置）：TipTap 全量

**文件**：
- `web/components/CommandPalette.tsx`
- `web/components/mention-chips.tsx`
- `web/lib/shortcuts.ts`
- `web/app/issues/[id]/page.tsx`
- `components/IssueSideSheet.tsx`
- `layout.tsx`

**验收**：Playwright（mention/keyboard 流 + a11y snapshot）+ 手动

### 2. Wiki Project Roots UI + Bulk Ingest
**Must**
- `web/app/projects/[id]/page.tsx` 暴露 project wiki roots（与 Memory page 对齐）
- Bulk ingest 支持 + coverage report
- Wiki query 优化（per-project 根）
**Out**：全量 wiki 图谱（低频）

**文件**：
- `web/app/projects/[id]/page.tsx`
- `wiki/project-wiki-roots.ts`
- `routes/wiki.ts`
- `app/packages/server/src/wiki/`

**理由**：已支持 roots（ADR-0005），UI 闭环提升 squad/project 上下文。

### 3. Run Observability & Timeout Deepening
**Must**
- `orchestration/run-observability.ts` + `routes/runs.ts` 增加 run-timeout + WS metrics
- 关键 HTTP mutate 契约测试（B3）
- live restore 闸门（quiesce + rollback journal，A4 之后开）
**Out**：全量生产 BI

**文件**：
- `routes/runs.ts`
- `orchestration/run-observability.ts`
- `db/schema.ts`
- `server/scripts/e2e-*.mts`

**理由**：graceful shutdown 已强，需提升“run observable/recoverable”体验。

### 4. Memory UI + Vector Health Probe
**Must**
- Memory manager UI 暴露 breaker status + auto-inject toggle（settings page）
- `memory/pgvector-provider.ts` + `routes/memory.ts` 增加 vector health probe + migration
**Out**：pgvector 全量生产化（Phase3）

**文件**：
- `web/app/settings/page.tsx`
- `memory/manager.ts`
- `memory/pgvector-provider.ts`
- `db/schema.ts`

**理由**：Settings-live-probes 已存在，闭环诊断。

### 5. 工程护栏
**Must**
- `shared/src/schema.ts` + `web/lib/api.ts` 收紧 Zod + Drizzle 类型
- 添加 memoryinject / squad-leader / wiki-lease 等 E2E 回归测试
**Out**：全量契约测试（B3 之后再开）

## 子代理分配建议
- **explore 子代理**（read-only）：快速调研具体文件（CommandPalette、wiki roots、run-observability、memory manager）。
- **plan / implement 子代理**（thick slice）：Wiki project UI + Memory UI（自包含 brief，输出 diff + test）。
- **Slice Owner**（本人窗）：最终路径验收 + Playwright 关刀 + main 直推。

## 验证与验收标准
- **Playwright**：新增/扩展 slice57–75 系列（mention/keyboard、wiki roots、run timeout、memory breaker）
- **手动**：日常派活→小队→run→Wiki/Memory 闭环，手感无翻车
- **单元**：vitest（schema、memory、wiki、orchestration）
- **达标判断**：
  - 前端：a11y/keyboard 覆盖率提升，wiki project roots UI 可用
  - 后端：run observability + vector health probe 可用
  - 整体：Phase-next-wave 剩余 gap 基本清零，product daily-usable 再深一层

## 风险与 Mitigation
- 风险：hydration 改动引入新 bug → 用 E2E + Playwright snapshot 捕获
- 风险：vector health probe 生产化 → 分步（sqlite-text → pgvector）
- 风险：wiki bulk ingest 影响性能 → 增量 + circuit breaker
- Mitigation：每刀后立即 Playwright + 手动复现；优先 F2 + Wiki roots（低复杂度高手感）

## 启动顺序推荐（按 ROI）
1. F2 / A11y + keyboard（快速 UX 胜点）
2. Wiki project roots UI
3. Run observability + memory UI
4. vector health + E2E 扩展
5. Shared types 收紧

## 下一阶段建议
- Phase 6 完成后 → Phase 7（可选：live restore 闸门 / 全量契约测试 / 更深 memory delegate 对齐）
- 持续监控 `app/.progress/phase-next-wave-2026-07-30.md` 与 `multica-gap-2026-07-17.md`

**已创建文件**：`app/.progress/phase6-robustness-polish-2026-07-30.md`  
此文件可直接用于 Slice Owner intake。需要我立即派子代理启动某个任务（如 F2 或 Wiki project roots）吗？