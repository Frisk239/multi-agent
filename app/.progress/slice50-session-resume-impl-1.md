# Slice 50 · Resume 能力矩阵（S2）impl-1

Date: 2026-07-27  
Slug: `slice50-session-resume`  
Branch: local（**不 commit / 不 push**）

## 目标

session resume 策略与各 Backend 真实能力一致，不装会。

## 交付

| 层 | 内容 |
|---|---|
| types | `RuntimeBackend.supportsSessionResume?: boolean` |
| backends | `claude-code=true`；`opencode` / `cursor` / `grok` / `pi` = `false` |
| 策略 | `session-resume.ts`：`runtimeSupportsSessionResume` / `sessionResumeCapabilityMatrix`；`resolvePriorSession` 读能力表而非 hardcode |
| execute | 非 claude **忽略** `resumeSessionId`（去掉假 `--session` / `--resume` argv） |
| diagnostics | Settings CLI capabilities 与 flag 对齐（仅 claude 标 Session Resume） |
| 单测 | `session-resume.test.ts`；`registry.test.ts`；`cliequalization` grok 不再期望假 resume；`pi.test` |
| e2e | `scripts/e2e-slice50-session-resume.mts`（无服 SKIP live） |

## 拍板（本刀）

- **claude-code**：真 resume + resume_miss 可观测（DS1 路径不回归）
- **opencode / cursor / grok**：CLI 参数曾存在，但策略层未验证可靠闭环 → **声明 false**，execute 忽略 resume
- **pi**：false（执行未实现）
- 统一：`getBackend(id).supportsSessionResume === true` 才 resolve/注入

## Out

跨 Runtime 迁移 session；自造 transcript；打开 opencode/cursor/grok 真 resume

## 验收命令

```bash
cd D:/code/multi-agent/app
pnpm exec vitest run packages/server/src/runtime/session-resume* packages/server/src/runtime/*resume* packages/server/src/runtime/registry.test.ts packages/server/src/runtime/cliequalization.test.ts packages/server/src/runtime/pi.test.ts --reporter=dot
pnpm --filter @ma/server typecheck
cd packages/server && pnpm exec tsx scripts/e2e-slice50-session-resume.mts
```

## 给下一 Owner

- Slice 51 · Ops snapshot + live-probes 去 stub（O1）
- 若某 CLI 实证 resume/session_id 可靠：backend 翻 true + 补 parse/finalize 测即可，无需再 hardcode
