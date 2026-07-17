# Handoff: bu03-planner-1

> 切片：`补3` / `bu03` · 角色：`planner` · 序号：`1`（验收 impl-1）  
> 日期：2026-07-17

## 结论

**impl-1 验收通过。** 可派 **impl-2**（串行，同分支 `feat/bu03-quick-create`）。

| 项 | 结果 |
|---|---|
| 0009 可空 issue_id + kind/quick_prompt + origin_* | ✅ |
| POST /api/quick-runs | ✅ |
| QC prompt + worker 闸 | ✅ |
| ma issue create + Link + M1 enqueue fix | ✅ |
| typecheck 复验 | ✅ |

顶端（验收时）：`a719238` 一带，已 push origin。

## 给 impl-2 的注意点

1. **API 已齐** — 只做 plan Task 4–5：`QuickDispatch` UI、Ctrl+K、侧栏；勿重做 migration/CLI。  
2. **ws null-safe 已有基础** — 可复用；提交后 toast「已派出」；可选短轮询 run 至 issueId。  
3. **无标题字段** — 仅 prompt + assignee（agent|squad）。  
4. **展示** — Agent Runs 若有 kind 列更好；看板只在 create 后出现 Issue。  
5. **回归** — typecheck + 点一次派活 API 路径；写 `bu03-impl-2.md`。  
6. 勿 commit `wiki/`、`*.db`；不 push main。

## 计划者

只验收 + 本文件；未改业务代码。
