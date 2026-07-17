# squad-readiness-summary

> 自动迭代 · Multica 对齐 · 厚切片

## 用户价值

派小队前能一眼看到 **队长 + 成员** 的执行就绪（cwd / runtime / busy），避免指派后全员挂。

## 范围

1. **小队详情**：成员列表旁 readiness chip；侧栏汇总 ready/warn/bad 计数 + 诊断链
2. **小队列表**：Leader 就绪状态短标
3. 复用 `useAgentsReadinessMap` / 现有 chip 样式；无新 API

## 验收

- Playwright `/squads` 与 `/squads/sqd-product` 可见汇总 / chip
- typecheck 绿

## 非目标

- 服务端 squad readiness 聚合端点
- 强制拦截指派