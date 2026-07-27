# Phase F 整队关刀 · Slice 71–73 · 2026-07-27

> Slice Owner · 子代理实现 · unit + Playwright/API e2e · main 直推  
> 计划：[slice-plan-2026-07-27-phase-f.md](./slice-plan-2026-07-27-phase-f.md)

## 范围

| 切片 | 主题 | 状态 |
|---|---|---|
| 71 | Activity RQ + WS invalidate | ✅ |
| 72 | Issue 合并故事线 | ✅ |
| 73 | 流式 partial / tool 折叠加深 | ✅ |
| 74 | Tool 只读面板 | ⏸ 可选未开（人可砍） |

## 代表证据

| 刀 | closeout / impl | 验收 |
|---|---|---|
| 71 | [slice71-activity-ws-closeout.md](./slice71-activity-ws-closeout.md) | activity-logger / ws unit；e2e unit PASS，live SKIP 无服 |
| 72 | [slice72-issue-storyline-closeout.md](./slice72-issue-storyline-closeout.md) | issue-storyline unit 6+；e2e mock PASS |
| 73 | [slice73-stream-partial-closeout.md](./slice73-stream-partial-closeout.md) | vitest 17 PASS；e2e-slice73 **PASS=8** |

## 关键决策

| 项 | 钉死 |
|---|---|
| Activity 广播 | `activity:created` DomainEvent + logger publish |
| RQ key | `['activities', issueId]` + WS append/invalidate |
| 故事线 | 客户端 `mergeIssueStoryline`；默认 tab「故事线」；保留评论/活动 |
| merge API | **不做** |
| partial | inline + drawer 消费 `partialByRunId`；保留 streamChunks 卡 |
| pair 折叠 | 一行 args 预览 + kind 色条；drawer stick-bottom |
| 74 | **可选**，本关刀不强制 |

## 残留（非 blocker）

- Slice 74 Tool 只读面板未做
- activity 中 `run_*` 与 run 锚点可能双显（72 有意；后续可按 runId 折叠）
- 多刀 live e2e 无本地 server 时 SKIP（unit 已钉）
- 无协议层大改；partial 仍靠 WS `appendPartial`

## 结论

**Phase F 主路径 71–73 全部落地**（Activity 活数据 + Issue 故事线 + Run 流式/折叠质感）。  
可选 74 留给下一会话或砍掉。

下一默认：人定是否开 **Slice 74**，或 gap 审计 / 新阶段选题。

## 相关

- 计划：[slice-plan-2026-07-27-phase-f.md](./slice-plan-2026-07-27-phase-f.md)
- 前一整队：[queue-63-70-phase-e-closeout-2026-07-27.md](./queue-63-70-phase-e-closeout-2026-07-27.md)
