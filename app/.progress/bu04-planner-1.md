# Handoff: bu04-planner-1

> 切片：`补4` / `bu04` · 角色：`planner` · 序号：`1`（验收 impl-1）  
> 日期：2026-07-17

## 结论

**impl-1 验收通过。** 可派 **impl-2**（串行，同分支 `feat/bu04-settings`）。

| 项 | 结果 |
|---|---|
| shared Settings* | ✅ |
| GET /api/settings/status | ✅ |
| G0 无密钥；cwd → blocked | ✅ |
| typecheck 复验 | ✅ |

顶端：`bdb6405` 一带，已 push origin。

## 给 impl-2 的注意点

1. API 已齐 — 只做 Task 3–4 UI，勿改诊断语义（cwd blocked 规则）。  
2. 只读页：无表单写 env；footer 说明环境变量配置。  
3. checks 排序 error→warn→ok；runtime 行 `href=/runtimes`。  
4. 侧栏 config「设置」+ Ctrl+K；Icon 已有 `settings`。  
5. 真 dev 进程下 memory 应 available（impl-1 inject smoke 未 init）。  
6. 勿 commit wiki/*.db；不 push main。

## 计划者

只验收 + 本文件。
