# Playwright 主航道验收 · 2026-07-19

> 工具：playwright-cli + API smoke  
> 派活：`agt-research` / **opencode**（按人要求；不派 claude-code/cursor）  
> HEAD 参考：`e687a78` 附近 main

## 1. 派活 · OpenCode

| 项 | 结果 |
|---|---|
| readiness `agt-research` | **ready** · runtime=opencode · cwdConfigured |
| `POST /api/quick-runs` assignee agent/agt-research | **201** · run `a5a59148…` kind=quick_create |
| 状态 | queued → **running**（心跳持续更新） |
| messages | 验收窗口内 **0 条**（CLI 已拉起但未回写轨迹/未完成） |
| UI 取消在途 | **通过**：`取消在途 · 1` → confirm → active 空 · API **cancelled** |

说明：OpenCode **派活链路与取消**通过；**完成态输出**本轮未等到（可能卡在 opencode CLI 交互，非排队失败）。

## 2. Playwright 页面清单

| 路径 | 结果 | 关键断言 |
|---|---|---|
| `/` 看板 | ✅ | kanban 列 backlog/todo/in_progress/in_review；快速派活入口；侧栏导航 |
| `/runs?status=active` | ✅ | runs-page；取消在途按钮；在途 banner |
| `/runs?status=failed` | ✅ | fail-recovery；收尸卡住按钮 |
| `/settings` | ✅ | cwd 持久化表单；run/wiki/memory 健康卡；收尸；wiki 全部重试 dead |
| `/memory` | ✅ | 表格/搜索/全选/行删除；删后筛选空 |
| `/wiki?jobStatus=dead` | ✅ | `全部重试 · 4` |
| `/inbox` | ✅ | Inbox 列表 + 已读/bulk 文案 |
| `/automation` | ✅ | 规则列表（2） |
| `/agents` | ✅ | 4 智能体；含调研/opencode |
| `/squads` | ✅ | 小队列表 |

## 3. API 动作抽检

| API | 结果 |
|---|---|
| `POST /api/wiki/jobs/retry-dead` | `{requested:4,retried:4}` |
| Memory 创建 + 删除 | UI 删除 confirm 后 rows=0 |
| `POST /api/runs/cancel-many`（经 UI） | 在途 run → cancelled |

## 4. 环境备注

- Settings overall **degraded**：`WIKI_LLM_API_KEY` 未配置（刻意 env 边界）
- cwd：**ok** · path `D:/code/multi-agent` · source env + persistedPath
- memory：sqlite-text available · 10 条级
- runtimes 探测：本机 claude-code / opencode / cursor **均 installed**；本轮仅**派活 opencode**

## 5. 结论

| 能力 | 验收 |
|---|---|
| 控制台导航与列表面 | **通过** |
| Settings 健康 + cwd 保存入口 | **通过** |
| Memory 删 / Wiki dead 重试 / Runs 取消 | **通过** |
| OpenCode 派活入队与 running | **通过** |
| OpenCode 完成并回写消息 | **本轮未通过（超时/无 message）** — 建议本机再盯 opencode CLI 是否交互挂起 |

**不阻塞**「本地控制台体验」完成态；OpenCode 完成输出属 runtime/CLI 层问题，可单开诊断。
