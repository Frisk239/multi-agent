# Closeout: agents-readiness-bulk

## 证据

- typecheck 绿（shared/server/web）
- API：`GET /api/agents/readiness?ids=agt-lead,agt-research,missing`
  - 200；`agt-lead.status=cwd_missing`；`missing=null`
- Playwright：`/agents` 列表 readiness 状态可见

## 交付

- server 批量路由（`/:id` 之前）
- web 单请求 map；15s 刷新

## 决策

- 复用 `computeAgentReadiness`；缺失 id 返回 null 键，不 404 整包

## 再下一刀建议

- cwd 持久化 ADR；runs bulk cancel；执行可靠性
