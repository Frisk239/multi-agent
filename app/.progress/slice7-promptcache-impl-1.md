# Slice 7: Prompt Cache 保护与 Tool 容错 (Prompt Cache & Fault Tolerance) 关刀记录

**日期:** 2026-07-26  
**Slice Owner:** Antigravity  
**验收状态:** ✅ 通过 (`pnpm typecheck` 0 报错 + 单元测试 PASS + Node/E2E 验证 100% PASS + `git push origin main` 成功)

---

## 落地内容与架构加深

### 1. 核心改进 (Prompt Cache 保护与 Tool 容错)
- **Prompt Cache 前缀隔离 (`packages/server/src/runtime/prompt.ts`)**:
  - 贯彻 hermes `system_and_3` Cache 保护规则：静态前缀（Skills, User About, Instructions, Squad Briefing）固定位于头部，防止前缀 Cache 频繁失效导致 LLM token 费用虚高。
  - 将 Wiki / Memory 召回封装入 `<retrieved-context kind="...">` 围栏作为附件追加，避免混打改写静态系统 prompt。
- **Tool Dispatch 容错自愈 (`packages/server/src/runtime/event-normalizer.ts` & CLI adapters)**:
  - 增加 `safeFormatToolError` 函数，针对对象循环引用、无法序列化的异常格式进行安全拦截。
  - 转换输出为结构化 JSON 提示 `{ "error": true, "reason": "...", "suggestion": "..." }`，透传回模型进行自愈重试，消解 Agent Loop 崩溃问题。

---

## 验证结论

1. **TypeScript 校验**: `pnpm typecheck` **0 Error** (packages/shared, packages/web, packages/server 全部 pass)。
2. **单元测试与 Node 验证**: `event-normalizer.test.ts` 及 `scripts/e2e-slice7-promptcache.js` 100% 校验通过。
3. **Commit & Remote Push**: 已推送到 `main` 分支。
