# Playwright E2E 验收 · 2026-07-30

## 环境
- Web: http://localhost:3000 （已有）
- API: http://localhost:3001 （本会话启动）
- DB: 新鲜库 pp/packages/server/e2e-playwright.db（旧 dev.db migrate 冲突：duplicate next_attempt_at，故用新库 migrate+seed）
- env: MA_ENQUEUE_ALLOW_NOT_READY=1

## 结果

| 脚本 | 结果 |
|---|---|
| e2e-multica-full-verify.mts | **6/6 PASS** |
| e2e-interactive-ui.mts | **5/5 PASS**（CmdK / 快速派活 / 新建 Issue / 侧栏） |
| e2e-slice50-session-resume.mts | **16 PASS / 0 FAIL**（含 live diag opencode/cursor resume） |
| e2e-slice67-force-fresh.mts | **8 PASS / 0 FAIL / 1 SKIP**（无 failed issue 可 retry） |
| e2e-automation-run-only-ui.mts | **5/5 PASS**（执行模式 select · 仅派活 badge · UI 创建 · API run-now 无 issue） |

## Live probes（摘要）
- claude-code / opencode / cursor: supportsSessionResume=true
- grok: false；pi: not installed / not implemented

## 说明
- Windows 上部分 tsx 退出时 UV_HANDLE_CLOSING 断言噪声，**summary 内 fail=0 为准**
- 旧 dev.db 需手工对齐 migrate journal；e2e 用独立 DB 更干净
