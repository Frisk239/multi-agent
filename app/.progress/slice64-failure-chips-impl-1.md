# Slice 64 · 失败 chip 与中文动作映射 · impl-1

## 改动

### 1. `packages/web/lib/failure-action-map.ts`（新 · UI map 真源）
- `FailureActionVariant` / `FailureActionUi`
- `FAILURE_ACTION_MAP`：13 档 reason → label / action / variant
- `resolveFailureActionUi` 解析序：
  1. 优先 `failureReason`（已知 map 键）
  2. 缺省 → `classifyFailure(error, { status })` from `@ma/shared`
  3. 未知 reason / 无串 → `exec_error`（「执行失败」）
- `shouldShowFailureActionChip`：failed / cancelled / timed_out / error / failureReason

### 2. `packages/web/components/FailureActionChip.tsx`（新）
- 展示 `label · action`
- `data-testid` / `data-variant` / `data-reason`

### 3. UI 挂点
- `RunDetailPage.tsx`：状态 pill 旁 `data-testid="run-failure-chip"`（保留原 `classifyRunFailure` failure box）
- `RunsPage.tsx`：失败行 status 列 `data-testid="runs-failure-chip"`

### 4. 样式
- `globals.css`：`.run-failure-chip[data-variant=retry|human|neutral]` 色差

### 5. 测试
- unit：`lib/failure-action-map.test.ts`
- e2e：`packages/server/scripts/e2e-slice64-failure-chips.mts`
  - Playwright route mock failed run（auth_required）
  - 仅拦截后端 `/api/*`（不误伤 Next `/runs` 页面）
  - CORS 头 + OPTIONS preflight
  - WEB 不可达 → SKIP

## 命令证据

### web unit
```text
cd app/packages/web && pnpm exec vitest run lib/failure-action-map.test.ts
```
结果：1 file / 11 tests **PASS**

### web typecheck
```text
cd app/packages/web && pnpm exec tsc --noEmit
```
结果：clean（exit 0）

### e2e
```text
cd app/packages/server && pnpm exec tsx scripts/e2e-slice64-failure-chips.mts
```
结果：
- web.reachable PASS
- run.detail.failure.chip PASS（需登录 · 检查 CLI/账号登录后重试）
- runs.list.failure.chip PASS
- log → `app/.progress/logs/e2e-slice64-failure-chips-*.log`

## 残留
- 未 commit / 未 push
- 未改 RunStatusBar / RunEventTimeline（可选，本刀未做）
- 未改 ws toast
- 未改 server 分类规则
- Slice 65 Inbox CTA / 67 forceFresh 未做

## Closeout 片段
- Slice 64 完成：failure chip map + Run 详情/列表挂点 + unit/tsc/e2e 绿
