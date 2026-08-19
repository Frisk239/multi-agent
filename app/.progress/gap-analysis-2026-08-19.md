# 差距分析 2026-08-19（Slice Owner · 对照 references）

依据：三路探索子代理（后端 / 前端 UX / 完成度核对）+ `hard-gap-audit-2026-08-08` + G8 closeout。

## 完成度（一句）

`main`=`e6ab04f` 上 **G1–G7 已关**（G6-5/G6-7 除外）。工作区另有 **08-08 硬缺口 + G8-1…5a 已验收未提交**；`roadmap.md` 未注册 G8。文档「已关」≠ 已进 main。

## 硬缺口（日用失真）

| 优先级 | 缺口 | 路径 | 建议刀 |
|---|---|---|---|
| P0 体验 | 看板 Sheet 看不到「现在在干什么」；预览取最早 N 条；失败 CTA 跳走 `/runs` | 派活 → 扫板 → 恢复 | **本刀：加厚 G8-6** |
| P0 编排 | running 时评论被 `already_active` 丢掉，无 follow-up 排队 | 边跑边吩咐 | 下一刀 |
| P1 | 消息首屏从 seq 1 翻；「加载更多」其实是更新的 | 长 run | 并入本刀 |
| P1 债 | G8-2…5a / G6-5/7 / envRef / Memory projectId 未进 main | git | 分刀提交，不混本刀 |
| 禁开 | G8-4b 真 probe、worktree、TipTap、图谱 | — | — |

## 已选

**本刀 slug：`g8-6-board-live-transcript`**  
用户路径：看板打开 Sheet → 见最新产出 → 失败就地再执行 → 不离开 `/?issue=`。  
Out：评论 follow-up（下一刀）、G8-4b、worktree、只改四个字。
