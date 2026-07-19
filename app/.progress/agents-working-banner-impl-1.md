# agents-working-banner · impl-1（G6）

日期：2026-07-19

## 决策

- 扩展 `GET /api/runs/active-count` → `agentsWorking`（active runs 去重 agentId）
- 看板顶栏 `AgentsWorkingBanner`：`N 个智能体工作中` + 深链 runs/agents
- 无 active 时仍展示 0（对齐 Multica 常驻状态条）

## 证据

- typecheck 绿
- API 含 agentsWorking
- Playwright 看板见 banner `data-count=0`

## 下一刀

- G8 inbox-archive-section / G13 agent-capability-tabs
