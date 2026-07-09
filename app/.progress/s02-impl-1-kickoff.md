# S02 impl-1 启动提示词（备份 · 若会话已派出可忽略）

> 完整版与下列代码块相同；派会话时整段复制即可。

```markdown
你是 S02 的 **impl-1 执行者**（不是计划者）。只做契约层 + DB + seed，**不要**写 API 路由、**不要**写前端、**不要**开 impl-2。

## 仓库
- 路径：`D:\code\multi-agent`
- 工程模式：见根目录 `AGENTS.md`（垂直切片 × 计划者-执行者；handoff 在 `app/.progress/`）

## 必读（按顺序，读完再改代码）
1. `AGENTS.md`
2. `app/.progress/s02-planner-1.md`
3. `app/.progress/s01-planner-2.md`
4. `docs/superpowers/specs/2026-07-09-s02-issue-detail-design.md` 的 **§2、§3、§4**
5. `docs/superpowers/plans/2026-07-09-s02-issue-detail.md` 的 Global Constraints + **执行者片段 A Task 1.1→1.5**

## 本会话范围
Task 1.1 分支 · 1.2 shared D11+Comment · 1.3 comment 表 migration · 1.4 toComment+seed · 1.5 写 s02-impl-1.md

## 硬约束
1. 从最新 main 开 `feat/s02-issue-detail`
2. LOCAL_MEMBER = `user-linyuan` / 林远
3. 消灭业务字段 `z.string().uuid()`
4. seed 按 identifier 挂评论
5. additive migration；删 dev.db* 再 migrate+seed
6. 只在 feature 分支提交；不做 routes/web

## 完成定义
- pnpm -r typecheck 绿
- FRI-11 ≥3 条 comment
- 提交 app/.progress/s02-impl-1.md（含真实自测输出 + 给 impl-2 注意点）
- 做完即停，等计划者验收
```
