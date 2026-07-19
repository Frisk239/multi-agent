# Intake: issue-subtasks

日期：2026-07-19  
HEAD：`932c4da` feat: one-level issue subtasks with Multica-style detail UI  
分支：已在 `main` / `origin/main`

## 检查

| 项 | 结果 |
|---|---|
| 合并 | ✅ main 直推 |
| 证据 | typecheck 绿；API children/progress/禁孙级；Playwright 子区+crumb+看板 badge |
| Spec vs 交付 | 一层 parent、详情添加、看板徽章 — 对齐 |
| 安全 | 无密钥；未 commit wiki/db |
| 债 | 无多层树 / project 继承（刻意） |

## 结论

**通过** — 开下一刀 `projects-mvp`（G16）。
