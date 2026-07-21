# UX Trust B1 — Chat 绑 Project / localPath

Date: 2026-07-21  
Branch: main

## 本刀范围

Chat 会话可绑 `project`；下一句 CLI cwd = `project.localPath`（有效目录）；头栏 select + exec-context 展示 mode/path。

## 决策

| 项 | 选择 |
|---|---|
| 存储 | `chat_thread.project_id`（migration 0027） |
| 解析优先级（chat） | **projectLocalPath** → `MA_CHAT_USE_WORKSPACE_CWD` → chat_scratch |
| 无效 path | mode=none · modeLabel=路径无效 · run 失败明确 |
| 解绑 | projectId=null → 回隔离 |

## 改动

- `0027_chat_thread_project.sql` · schema · shared `ChatThread.projectId` · `UpdateChatThreadProjectInput` · `ChatExecContext.mode` 含 `project_local`
- `resolve-run-cwd` chat 优先 project path
- `run-worker` chat 从 thread.projectId 读 localPath
- `routes/chat.ts` PATCH `/project` + exec-context
- `ChatPage` 项目 select · api hook · CSS

## 验收

| 项 | 结果 |
|---|---|
| typecheck | PASS |
| migrate 0027 | ✓ |
| API 绑 valid | exec=project_local · path=D:\code\multi-agent |
| API 解绑 | exec=chat_scratch · 隔离 workdir |
| API 无效 path | mode=none · exists=false |
| Playwright 头栏 | select +「项目本机 · path」 |
| Playwright 解绑 UI | mode=chat_scratch ·「隔离」 |

## 上一刀 E2E

Wave A 全绿见 `ux-trust-wave-a-e2e-2026-07-21.md`。

## 下一刀

**B2** QC 可选 project + 服务端硬闸（与 Issue 同闸）。
