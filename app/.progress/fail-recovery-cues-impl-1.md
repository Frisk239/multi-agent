# Closeout: fail-recovery-cues

## 证据

- typecheck 绿
- Playwright：
  - `/runs?status=failed` 横幅 cwd 计数 + 链 settings/runtimes/board/agents blocked
  - `/?failed=1` note 链 runs/inbox/settings；卡片失败 badge → `#run-trace`（9）

## 交付

- Runs failed 恢复横幅（cwd 特判）
- 看板仅失败 note + 空态补 settings
- 卡片失败徽章可点进详情 trace

## 再下一刀建议

- inbox 失败项内联再执行；settings cwd 复制后回跳 runs
