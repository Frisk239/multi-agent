# Slice 65 · Inbox / Run 默认可行动 CTA · impl-1

## 改动

### 1. `packages/web/lib/inbox-run-cta.ts`（新 · CTA 纯函数真源）
- `InboxPrimaryCta` / `InboxPrimaryCtaKind` / `InboxCtaSource`
- `resolveInboxPrimaryCta(item)` 规则：
  1. chat 失败 / chatish → `open_chat`「打开会话」
  2. failed + runId + (issueId | runKind=issue) → `retry`「再执行」（走既有 API，不造假）
  3. failed + runId 无 issue（quick_create）→ `open_run`「查看运行」
  4. waiting / deferred → `open_run` 或 `open_issue`
  5. 其它有 runId → `open_run`
  6. 仅 issueId → `open_issue`
  7. 否则 `none`
- `inboxRunHref` / `isActionableInboxItem`

### 2. `packages/web/components/InboxPage.tsx`
- 统一主按钮 `data-testid="inbox-primary-cta"` + `data-cta-kind`
- 行内 / Issue 工具栏 / 无 Issue 详情：挂 `InboxPrimaryCtaControl`
- 空态标题强调「没有需要处理的项」
- 默认仍 `hideSuccess=true`（偏失败/关注）；不改 `/settings/inbox-prefs` 契约
- 次要入口降权（DM / 时间线 / 全页 / 聊天）避免双主按钮

### 3. 测试
- unit：`lib/inbox-run-cta.test.ts`（17）
- e2e：`packages/server/scripts/e2e-slice65-inbox-run-cta.mts`
  - mock `/api/inbox` failed 列表 → 主 CTA 可见
  - `open_run` 可导航到 `/runs?run=…&status=failed`
  - 空态 copy 含「需处理」
  - WEB 不可达 → SKIP

## 命令证据

### web unit
```text
cd app/packages/web && pnpm exec vitest run lib/inbox-run-cta.test.ts
```
结果：1 file / 17 tests **PASS**

### web typecheck
```text
cd app/packages/web && pnpm exec tsc --noEmit
```
结果：clean（exit 0）

### e2e
```text
cd app/packages/server && pnpm exec tsx scripts/e2e-slice65-inbox-run-cta.mts
```
结果：
- web.reachable PASS
- inbox.primary.cta.visible PASS（kind=retry · 再执行）
- inbox.primary.cta.navigate PASS（→ `/runs?run=run_slice65_qc_mock&status=failed`）
- inbox.empty.actionable.copy PASS
- log → `app/.progress/logs/e2e-slice65-inbox-run-cta-*.log`

## 残留
- 未 commit / 未 push
- 未改 server 分类 / inbox-prefs schema
- 未做 per-agent 订阅 / 桌面通知桥
- 旧 `data-testid="inbox-retry-run"` 改为 `inbox-primary-cta`（retry 带 `data-inbox-retry-run="1"`）
- Run 列表/详情 recovery 标签本刀未强制对齐（既有「再执行」已够用）

## Closeout 片段
- Slice 65 完成：Inbox 主 CTA 纯函数 + UI 挂点 + 空态需处理 + unit/tsc/e2e 绿
