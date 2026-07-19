# usage-dashboard · impl-1（G17）

日期：2026-07-19

## 对照

| 源 | 结论 |
|---|---|
| Multica 真站 `/usage`（storage-state） | 7/30/90d KPI：费用/Token/时长/任务 + 每日图 + 智能体排行 |
| Multica runtime usage-section | 云端 token/cost 真数据 |
| 本仓 | run 表有 status/时长字段；**无 token 账单** |

## 决策

1. **本地 KPI**：任务数、成功率、总/均时长；Token/费用卡片明示不可用。  
2. **API** `GET /api/usage?days=` 聚合 `agent_runs` + agent 名排行 + 按日序列。  
3. **侧栏**工作区增加「用量」→ `/usage`。  
4. 不做费用估算、不做图表库（条形 CSS 即可）。

## 验收

- `GET /api/usage?days=30` 200  
- Playwright `/usage`：kpi total/rate、day chips、agent table、nav  
- typecheck shared/server/web  

## 非目标

- Token 解析 CLI 日志  
- 按项目维度（无 project 实体）  
- 真·图表库
