# Slice 20 (S6): Cron 表达式与自动化规则加深 - Closeout

## 完成事项

1. **DB Schema & 类型更新**:
   - `automation_rule` 新增 `cron_expression` 字段。
   - 更新 `packages/shared/src/schema.ts` 的 Zod schema 和 Enum 以支持 `cron`。

2. **后端逻辑 (Server & Dispatch)**:
   - 引入 `cron-parser` 并通过 `CronExpressionParser.parse` 解析。
   - `reshape.ts` 和 `automation-dispatch.ts` 已支持通过 `interval.next()` / `interval.prev()` 计算 `nextPlannedAtMs` 和 `duePlannedAtMs`。
   - 增加 `/api/automation/preview-cron` 接口用于返回未来 5 次运行时间的预览。
   - 补充单元测试 `packages/server/src/automation/cron.test.ts`，Vitest 运行通过。

3. **前端 UI (Web)**:
   - `AutomationPage.tsx` 增加 `cron` 的输入框与预设快捷 Chip。
   - 对接 `/api/automation/preview-cron` 实现未来 5 次运行预览。
   - 优化显示 `scheduleLabel` 对 `cron` 的支持。
   - "立即执行" (Run now) 按钮复用现有流程，功能完备。

4. **工程验证**:
   - `pnpm typecheck` 通过，已解决 `cron-parser` 模块相关的类型推断及引用问题。
   - 增加 `scripts/e2e-slice20-cronautomation.js` 以便 Playwright 验证 Cron 规则的创建与展示。

## 下一步建议
可以进行主分支合入或探索下一个 Slice，当前 Slice 20 已达到可验收与运行标准。
