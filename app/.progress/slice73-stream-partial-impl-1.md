# Slice 73 · 流式 partial / tool 折叠加深 · impl-1

## 钉死决策

| 项 | 值 |
|---|---|
| partial | inline + drawer 消费 `partialByRunId`；`data-testid="run-partial"` + Markdown |
| stream | 保留 `streamChunks` 卡（`run-stream-chunk`）；与 partial 可同屏 |
| pair 折叠 | header：tool name + **一行 args**（`pairArgsLinePreview`）+ kind 色条 class |
| stick-bottom | drawer body 近底吸底；partial/stream 变更触发；80ms throttle；sentinel |
| Out | opencode 协议大改；Tool 面板（74）；宣称对标真站全集 |

## 改动文件

| 路径 | 作用 |
|---|---|
| `packages/web/lib/run-event-pairs.ts` | `pairArgsLinePreview` / `kindToneOf`；密化 `pairCollapsedPreview` |
| `packages/web/lib/run-event-pairs.test.ts` | unit：args 行 / dense / tone |
| `packages/web/components/RunEventTimeline.tsx` | partial + denser pair + stick-bottom；jsdom 安全 `scrollIntoView` |
| `packages/web/components/RunEventTimeline.test.tsx` | 组件测：partial / pair / drawer |
| `packages/web/app/globals.css` | kind-bar / args preview / live partial |
| `packages/server/scripts/e2e-slice73-stream-partial.mts` | unit 内联 + 源接线 + 轻 UI |

## 自测（已跑）

```text
web vitest run-event-pairs + RunEventTimeline   # 17 PASS
e2e-slice73-stream-partial.mts                  # PASS=8 FAIL=0 SKIP=0
```

## closeout

- 关刀日：2026-07-27
- Owner 复验：unit 17 + e2e 8 绿
- 修复：drawer stick-bottom 在无 `scrollIntoView` 环境（jsdom）不抛
- 整队：见 [queue-71-73-phase-f-closeout-2026-07-27.md](./queue-71-73-phase-f-closeout-2026-07-27.md)

## 残留

- 无协议层改动；partial 仍靠 WS `appendPartial`
- inline 列表区未做独立 stick-bottom（drawer 为主）
- Slice 74 Tool 只读面板可选
