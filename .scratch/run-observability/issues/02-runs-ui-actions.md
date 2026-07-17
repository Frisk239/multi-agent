# 02 — `/runs` 页 + Issue/Agent/Inbox 可行动 UI

**What to build:** 侧栏与 CmdK「运行」；`/runs` 浏览与筛选；Issue 失败区强化；run/issue 再执行按钮；Agent Runs 与 Inbox `run_failed` 深链；接 01 API。

**Blocked by:** 01  

**Status:** resolved 

**Branch:** 继续 `feat/run-observability`（串行）

## Acceptance

- [x] Sidebar 工作区 + Command palette 可进入 `/runs`  
- [x] `/runs` 展示 run 列表：status、agent、issue 链接、kind、error/分类 hint、时间  
- [x] 有 `issueId` 的 failed/cancelled：可「再执行」→ 调 retry/rerun API，toast 结果  
- [x] 无 `issueId` 的 QC 失败：不显示假 rerun，引导快速派活（可预填 prompt）  
- [x] Issue 详情：失败时完整 error + 分类 + 打开 Settings/复制 + Issue 再执行  
- [x] Inbox `run_failed`：点击进入 issue（或无 issue 时可读说明）  
- [x] Agent 详情 Runs：失败可读；有 issue 可再执行  
- [x] typecheck 绿；手验或 playwright-cli 要点写 Comments  
- [x] 不改 dispatch/automation 语义；不 push main

## Implementation notes

- 复用现有 `RunStatusBar` / `RunTrace` / toast 模式。  
- WS：全局 `/runs` 列表 invalidate 策略简单即可（focus refetch 或监听 run 事件 invalidate `['runs']`）。  
- 分类：可 client 调同一规则或消费 API 附加字段；保持与 01 一致。

## Comments

（执行者）
