# Slice 9: Memory 时序有效窗口与多信号检索 (Memory Temporal Validity) 关刀记录

**日期:** 2026-07-26  
**Slice Owner:** Antigravity  
**验收状态:** ✅ 通过 (`pnpm typecheck` 0 报错 + 单元测试 PASS + Playwright E2E 验证 100% PASS + `git push origin main` 成功)

---

## 落地内容与架构加深

### 1. 核心改进 (Memory 时序有效窗口与多信号检索)
- **DB Schema 与记忆时序属性 (`packages/server/src/db/schema.ts` & `@ma/shared`)**:
  - 在 `memory_items` 表增加 `valid_at` 和 `invalid_at` 列。
  - DTO 类型及 Zod Schema 扩展支持可空时间戳。
- **Memory Provider 过滤与作废 API (`packages/server/src/memory/`)**:
  - 增加 `invalidateMemory(id)` 方法，捕获新记忆冲突时标记旧记忆作废。
  - 检索逻辑默认自动进行时序过滤（`invalidAt IS NULL OR invalidAt > now()`），防止过时旧记忆误导 Agent。
- **前端视图联动 (`components/MemoryPage.tsx`)**:
  - 增加 `includeInvalid` Query 支持。
  - 前端渲染绿色的 Active 和红色的 Expired (已失效) 状态 Badge。

---

## 验证结论

1. **TypeScript 校验**: `pnpm typecheck` **0 Error** (packages/shared, packages/web, packages/server 全部 pass)。
2. **单元测试与 Node 验证**: `sqlite-text-provider.test.ts` 及 `scripts/e2e-slice9-memorytemporal.js` 100% 校验通过。
3. **Commit & Remote Push**: 已推送到 `main` 分支。
