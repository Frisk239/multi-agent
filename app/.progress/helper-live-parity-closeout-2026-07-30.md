# Closeout: helper-live-parity

## 交付

- 分支：`main`
- 用户路径：任意页面打开 HelperRail → 发送消息 → 看到 queued/running、progress、tool、partial → 失败或取消后可重发、查看 Run、进入环境诊断。
- ChatPage 与 HelperRail 复用 `useChatLiveState(threadId)`，不再维护两套 run/trace/failure 投影。

## 证据

- `pnpm typecheck`：通过。
- `pnpm test`：shared 92、server 388、web 231，共 711 tests 通过。
- Playwright CLI（隔离临时 SQLite，真实 Web/API）：
  - 打开 HelperRail，发送“请只回复：helper live 验收”。
  - 浮窗立即显示“执行中”，全局在途计数为 1，发送按钮禁用。
  - 调用真实 cancel API 后，浮窗显示“运行已取消”，并出现“重发上一条 / 查看运行”。
  - 控制台仅有无关的 `favicon.ico` 404。

## 偏离 / 未做 / 债

- 未新增后端 schema/API；复用现有 chat run、run messages 和 WS progress store。
- 未做 HelperRail 全量等同 ChatPage；项目 dirty 二次确认仍沿用既有边界。
- partial/tool 投影已由共享 hook 和单测覆盖；本次真实 CLI run 在验收窗口内未产出 partial，故 Playwright 主要证明 queued/running 与终态恢复路径。

## 调研结论与下一刀

- 前端后续硬缺口：真实本地附件、可搜索指派器、滚动位置恢复、结构化 Tool 面板。
- 后端 P0：灾备仍只能隔离 staging；下一刀优先设计并实现安全 live restore 闭环，必须含 maintenance/quiesce、恢复前快照、rollback journal、active run 收尸和原子换入，不能直接开放覆盖按钮。
- 后端 P1：Grok 当前仍是兼容参数猜测，完整 ACP 或 fail-closed 仍待处理。
