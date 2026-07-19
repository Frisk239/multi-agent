# agent-work-dashboard · impl-1（G12 + G11 私信入口）

日期：2026-07-19  
对标：Multica Agent 详情 · 概览/工作/成功率/私信

## 范围

| 项 | 落地 |
|---|---|
| G12 工作历史 + 成功率仪表 | `GET /api/agents/:id/work-stats?days=30` + 概览 Tab |
| G11 私信入口 | Agent 侧栏「私信」→ 创建 chat thread → `/chat?thread=` |
| Tab 文案 | 概览 / 工作 / Skills / MCP / 设置（对齐真站语感） |

## API

`AgentWorkStats`（shared）：

- windowDays / total / completed / failed / cancelled / active  
- successRate = completed / (completed+failed)  
- avgDurationMs（completed 且有 started/finished）  
- lastRunAt

## UI

- 默认 **概览**：4 张 stat 卡 + 最近 8 条工作表  
- **工作** Tab：原 runs 表（kind 显示含 chat）  
- 侧栏：**私信** / 分配工作 / 在途运行  
- Chat：`?agent=` 可预选 agent

## 验收

- `GET /api/agents/agt-lead/work-stats?days=30` → 200 JSON  
- Playwright `/agents/agt-lead`：overview + rate + tabs；工作表 20 行；私信跳 chat thread  
- typecheck shared/server/web 通过  

## 非目标

- 无真实 token 计费（本仓 run 无 token 字段；用量中心 G17 另刀）  
- 无流式 Helper rail（G10）  
- 无 30 天图表，仅数字卡片  

## 下一刀建议

- `issue-run-usage`（Issue 详情 run 聚合）  
- `helper-rail`  
- `usage-dashboard`（工作区级聚合，可复用 work-stats 思路）
