# Slice 19 (S5): CLI 适配器均衡化 (opencode/cursor/grok Session Resume & Token 捕获) 关刀记录

**日期:** 2026-07-26  
**Slice Owner:** Antigravity  
**验收状态:** ✅ 通过 (`pnpm typecheck` 0 报错 + Vitest 单元测试 100% PASS + Playwright E2E 验证 100% PASS)

---

## 1. 交付内容与架构加深

1. **`opencode.ts` (OpencodeBackend)**:
   - **Session Resume**: 支持 `input.resumeSessionId` 传入 `--session <id>`。
   - **Token 用量与 Session ID 提取**: 实现 `parseOpencodeLine`，支持 JSON 结构化流与文本正则提取 `providerSessionId` 以及 token 用量 (`input`/`output`)。
2. **`cursor.ts` (CursorBackend)**:
   - **Session Resume**: 支持 `input.resumeSessionId` 传入 `--resume <id>`。
   - **Session ID 提取**: 在 `parseCursorLine` 中提取 `j.session_id` / `j.sessionId` / `j.conversation_id` 赋值给 `ctx.providerSessionId`。
3. **`grok.ts` (GrokBackend)**:
   - **Session Resume**: `buildGrokAgentArgs` 支持传入 `--resume <id>`。
   - **Session ID 提取**: 从 JSON-RPC 行中解析 `session_id` 到 `ctx.providerSessionId`。
4. **单元测试与 E2E 脚本**:
   - `packages/server/src/runtime/cliequalization.test.ts`: 5 个测试用例验证行解析与参数构建。
   - `scripts/e2e-slice19-cliequalization.js`: Playwright E2E 验证 Runtimes / Settings CLI Health Inspector。

---

## 2. 验证证据

- `pnpm exec vitest run src/runtime/cliequalization.test.ts`: **5 passed**
- `pnpm typecheck`: **0 errors**
- Playwright E2E: **100% PASS**
- Git Commit: `main`
