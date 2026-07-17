# Handoff: bu02-planner-2

> 切片：`补2` / `bu02` · 角色：`planner` · 序号：`2`（整刀验收）  
> 日期：2026-07-17

## 结论

**补2 整刀验收通过**（impl-1 API + impl-2 UI）。

| 棒 | 内容 | 状态 |
|---|---|---|
| impl-1 | schema 0008、Agent/Squad CRUD、readiness、runs、prompt instructions | ✅ |
| impl-2 | Agents/Squads 运营 UI、Runs/Instructions、指派 smoke | ✅ |

分支：`feat/bu02-roster-ops` @ `4683f7d`（已 push origin）。  
计划者复验：`pnpm -r typecheck` 全绿。

## 抽查

- roster：POST/PATCH/DELETE agents & squads；readiness；runs  
- prompt：instructions 在 memory 后、briefing 前  
- UI：Placeholder 已灭；新建/编辑/删除；409 规则与 toast  
- 指派新 agent/squad → run 入队（handoff smoke）

## 下一步（人）

1. **开 PR** `feat/bu02-roster-ops` → `main`  
2. 新会话 code review（勿带 `wiki/`、`*.db`）  
3. 合 main 后更新进度表补2 ✅  
4. **补3** 实现可开（plan/kickoff 已在 main）：`feat/bu03-quick-create`

## 计划者

只填验收 + 本文件；未改业务代码。
