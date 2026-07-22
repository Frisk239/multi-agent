# Closeout: G23 Run 事件时间线密度（tool pair-fold）

Date: 2026-07-22  
Slug: `run-event-timeline`  
Branch: `main`（本地 commit；push 人手动）

## 交付

| 层 | 内容 |
|---|---|
| 配对 | `web/lib/run-event-pairs.ts`：`pairRunToolEvents`（同名 LIFO）+ drawer filter helper |
| Inline/Drawer | `RunEventTimeline.tsx`：成对折叠 `run-event-tool-pair`；抽屉筛 全部/工具/助手 |
| Run 详情 | `RunDetailPage.tsx`：transcript 同配对 `run-detail-tool-pair` |
| 入口 | IssueDetail「时间线」按钮；Inbox 失败项 `inbox-open-timeline` → `/runs?run=&timeline=1` |
| 样式 | `globals.css` pair 行密度 |
| smoke | `web/scripts/test-run-event-pairs.mts` + Owner inline pair smoke |

## 证据

- `pnpm typecheck` shared/server/web PASS  
- pair 逻辑：同名 start/end → pair；未配对保留 single；非 tool 不变  
- 深链：`/runs?run=<id>&timeline=1`（RunsPage 已有 drawer open）

## Out of scope

- 新 schema / 改 worker 落库格式  
- opencode 流解析加固  
- Helper 第三栏  
- 宣称「完全对标真站色条全集」

## 下一刀

1. **Inbox 阅读器加深**（G21 residual）：右栏密度 / 读后即回 / 无 issue 诚实 CTA（不装三栏完成）  
2. Token 用量面板 polish（G4/G27 residual）  
3. 子 issue / PR / 字段自定义薄刀  

## 相关

- gap live G23  
- 前序：G22 `6272253` · DS3 `266e97f`  
