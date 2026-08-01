# 优化波次 2026-08-01 · 关刀 closeout

> 分支 `feat/issue-workbench` · 来源：用户目标「按合理顺序把这些优化点都做掉」
> 顺序：W4 → W2 → W3 → W5 → W6 → W7 → P2 尾巴 → 主线拆解

## 完成清单（14 commit 全 push）

| 刀 | commit | 内容 | 证据 |
|---|---|---|---|
| W4 CI 护栏 | `584bb14` | pnpm test 进 CI + e2e runner（无服 SKIP 不假绿） | runner 三态实测 |
| W2 乐观更新 | `5337cad` | optimistic.ts + 4 个高频 mutation 接入（回滚 toast） | 17 新测试 |
| W3 表单校验+a11y | `6a25570` `0be8358` | aria-sort/键盘排序/FieldError/Zod 校验/焦点陷阱/排序 URL | 27 新测试 |
| W5 契约+故障注入 | `ec730d1` | issues 契约 27 例（含搜索 503 超时）+ run-worker 故障注入 6 例 + chat/memory/wiki 契约 | 44 例全绿 |
| W6 内置自省 skill | `9df405d` | 3 个 ma-* skill + source-map；builtin 索引/覆盖/UI 标记 | 3 测试 |
| W7 invoke gate+stage | `b06c2ee` | mention-only 闸门（迁移 0046）+ 子 issue stage 屏障 | 4+3 新测试；迁移实跑 |
| P2 尾巴 | `4695227` | Wiki 跨根 UI 开关 + run 详情改派标注 | typecheck 绿 |

**波次终验：** server **80 文件 / 647 用例全绿**（无 unhandled）+ web 389+ 全绿 + 三包 typecheck 全绿；W3 漏提交的 globals.css/KanbanBoard 已补入 `0be8358`。

## 主线：reopenable-db-lifecycle

**未实施（诚实说明）**：仓库级重构（58 个文件 import db/client 单例 + worker 生命周期 + memory 重绑定 + active run 恢复），本会话完成**现状核实与拆解设计**：
`app/.progress/reopenable-db-lifecycle-breakdown-2026-08-01.md`（D1 动态 accessor 的 live-binding 验证点 / D2 worker stop-start / D3 memory 重绑定 / D4 active run 终态化 / D5 闭环）。按宪法「特大/特雾 → 下一会话 Owner」留给单独会话，避免半成品。

## Remaining / 后续

- **主线 reopenable-db-lifecycle**（下一会话，按拆解文档开工）
- W5 Out：skill/scanner + import-url 完整测试（543+479 行）
- P2-3 Out：CLI `ma wiki query --roots`（UI 开关已做）
- P2-4 边界：enqueue 硬闸与改派互补（closeout 已记）

## 关刀规范核对

- ✅ 每刀 vitest + typecheck；e2e：W4 runner + W5 契约/注入 + W7 迁移实跑
- ✅ Conventional Commits（feat ×6 / test ×1 / ci ×1 / docs 若干）
- ✅ 未 commit `wiki/` `*.db` 运行产物；e2e 临时 DB 已清理
