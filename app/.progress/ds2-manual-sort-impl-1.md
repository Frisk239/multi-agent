# Closeout: DS2 看板手动排序

Date: 2026-07-22  
Slug: `ds2-manual-sort`  
Commit: pending push main

## 交付

| 层 | 内容 |
|---|---|
| shared | `ListIssuesQuery.sort`；`ReorderIssuesInput` |
| API | `POST /api/issues/reorder`（整列 `orderedIds` → position 0..n-1；可跨列改 status + status_change） |
| API | `GET /api/issues?sort=manual\|updated`（默认 manual = position） |
| API | `PUT` 改 status 且未带 position → 目标列顶（min-1） |
| UI | 看板同列/跨列 DnD 落库（卡槽 beforeId / 列末） |
| UI | 列表 `?view=list&sort=manual\|updated` 切换 |

## 证据

- `pnpm typecheck` PASS（shared/web/server）
- `pnpm exec tsx scripts/test-ds2-reorder.mts` ALL PASS  
  - 同列 reorder B A C  
  - GET 默认 manual 序  
  - sort=updated  
  - 跨列迁入  
  - PUT status → 列顶  
  - 缺失 id 404  

## 偏离

- 无独立 Playwright 浏览器路径：以 inject 脚本 + typecheck 为关刀证据（与 P2 polish 同类）
- 列内 position 重编号为 0..n-1 整数（非无限精度 float 间隙）；并发 best-effort，无 CRDT

## 债 / 未做

- 完美无冲突 position 间隙算法  
- 多维自定义字段排序  
- Playwright 真拖拽 e2e（可后补）

## 给下一 Owner

- 阶段表：`phase-ux-deep-2026-07-22.md` → **DS4** token/thinking  
- 计划：`docs/superpowers/plans/2026-07-22-ux-deep-slices.md`  
- 上一刀 intake：`ux-p2-polish-intake.md`（通过）
