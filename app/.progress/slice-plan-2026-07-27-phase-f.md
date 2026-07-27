# 下一阶段切片计划 · Phase F · 2026-07-27

> **方法：** Phase E 收官后开 **故事线 + 活数据 + run 质感**  
> **北星：** 本地 Multica 控制台体验（Issue 一条故事线可跟；run 过程可感）  
> **前置：** [queue-63-70-phase-e-closeout-2026-07-27.md](./queue-63-70-phase-e-closeout-2026-07-27.md) · [phase-e-intake-2026-07-27.md](./phase-e-intake-2026-07-27.md)  
> **编号：** 续接 Slice 70 → **71+**  
> **本阶段主题：** **Activity 活起来 → 合并故事线 → 流式/工具面板加深**

---

## 0. 阶段判断

| 判断 | 说明 |
|---|---|
| 主航道 | **已可用**；E 已收失败可解释 + 恢复纵深 |
| 缺口性质 | Issue 动态三源分裂（评论 tab / activity 死拉取 / run 区另栏）；Activity 无 WS；Run partial 弱于 Chat |
| 工程 | Slice Owner · 子代理 · unit + Playwright/API e2e · **main 直推** |

**刻意不做：** 云 webhook · Redis 房间 · TipTap 全量 · Wiki 图谱 · 真 ToolRegistry 写执行 · 后端强制 merge API（首刀可不做）· daemon 1:1

**学现状（本仓）：**
- Slice2 = activities API + 双 tab（**不是**合并故事线）
- G23 = RunEventTimeline pair-fold
- Chat 已有 partial live；Run inline 偏 streamChunks

---

## 1. 四刀总览

```text
71 F2 Activity 活数据     72 F1 合并故事线      73 F3 流式加深      74 F4 Tool 面板（可选）
RQ + WS invalidate   →   客户端 merge UI   →   Run partial 对齐  →   只读工具侧栏
```

**默认顺序：**

```text
71 → 72 → 73 → 74（可选）
```

- **71 先活：** Activity 不用 RQ/WS 时，合并故事线仍是「再进 tab 才刷新」。  
- **72 故事线：** 演示主菜；依赖 71 才有 live 感。  
- **73 run 质感：** 可与 72 后紧跟；演示临近可 71+73 跳过 74。  
- **74 可选：** Tool 只读面板；人可砍。

---

## 2. 切片明细（71–74）

### Slice 71 · Activity RQ + WS invalidate  
**轨：** F2 · **厚度：** 半–1 刀 · **端：** 双端

| | |
|---|---|
| **Must** | `useActivities(issueId)` RQ key `['activities', id]`；`recordActivityLog` 后广播 `activity:created`（或等价 DomainEvent）；`ws.ts` handler + 重连 `invalidateForPath` 含 activities；`ActivityTimeline` 改用 hook（loading/error 轻量） |
| **Out** | 合并故事线 UI（72）；改全量 activity 语义 |
| **验收** | unit：hook/key 或 logger 广播；e2e API/WS 或 UI：造 activity 后列表刷新（可 mock WS） |
| **进度** | `slice71-activity-ws-impl-1.md` |

### Slice 72 · Issue 合并故事线  
**轨：** F1 · **厚度：** 1–1.5 刀 · **端：** 前端为主

| | |
|---|---|
| **Must** | 客户端 merge：comment + activity + 关键 run 锚点（按 `createdAt`）；Issue 动态区新 tab「故事线」或默认替换双 tab（**拍板：加 tab「故事线」为默认**，保留评论/活动）；run 行点开既有 drawer；空态清晰；sheet 可仅故事线精简 |
| **Out** | 新后端 merge API；把 tool 全文灌进故事线；推翻 Run 区 |
| **验收** | unit：merge 纯函数；e2e：Issue 故事线可见评论+状态/run 类事件 |
| **进度** | `slice72-issue-storyline-impl-1.md` |

### Slice 73 · 流式 partial / tool 折叠加深  
**轨：** F3 · **厚度：** 1 刀 · **端：** 前端

| | |
|---|---|
| **Must** | Run inline/drawer 消费 `partialByRunId`（对齐 Chat 质感）；pair 折叠预览更密（kind 色条/短预览）；live stick-bottom 可观测；单测 pair + 轻 e2e/组件测 |
| **Out** | opencode 协议大改；宣称对标真站全集 |
| **验收** | unit pair/partial 展示逻辑；e2e mock stream 可见 partial 或 deepened fold |
| **进度** | `slice73-stream-partial-impl-1.md` |

### Slice 74 · Tool 事件只读面板（可选）  
**轨：** F4 · **厚度：** 1 刀 · **端：** 前端

| | |
|---|---|
| **Must** | 从 pair/tool 消息抽 name/args/result → 侧栏或 drawer 子视图；只读、可复制、按 run 过滤；入口：轨迹「工具 N」或 filter=tool 强化 |
| **Out** | 真 ToolRegistry 注册/执行；写操作 |
| **验收** | unit 抽取；e2e 打开面板见 tool 名 |
| **进度** | `slice74-tool-panel-impl-1.md` |

---

## 3. 关刀纪律

| 项 | 要求 |
|---|---|
| 每刀 | typecheck + 相关 unit + **≥1** Playwright 或 API e2e |
| 进度 | `app/.progress/sliceNN-*-impl-1.md` + closeout |
| Git | **main 直推**；Conventional Commits |
| 整队 | 73/74 后写 `queue-71-*-phase-f-closeout-*.md`，滚 CONTEXT + multica-gap |

---

## 4. 决策记录（开写默认）

| 决策 | 默认 | 可改 |
|---|---|---|
| 首刀 | **71 Activity 活数据** | — |
| 故事线 | **客户端 merge**；加 tab 默认「故事线」 | 可改为替换双 tab |
| merge API | **不做**（除非 72 性能崩） | — |
| 74 | **可选** | 人可砍 |
| Phase G | 不预开 | — |

---

## 5. 一句话给 Owner

```text
Phase F：先让 Activity「活」（71），再合并 Issue 故事线（72），
然后 Run partial/折叠质感（73）；Tool 只读面板 74 可选。
开刀：验 Phase E closeout → 实现 Slice 71。
```

---

## 6. 相关路径

| 读什么 | 路径 |
|---|---|
| Phase E 关刀 | [queue-63-70-phase-e-closeout-2026-07-27.md](./queue-63-70-phase-e-closeout-2026-07-27.md) |
| Phase E 计划 §3 草案 | [slice-plan-2026-07-27-phase-e.md](./slice-plan-2026-07-27-phase-e.md) |
| 差距表 | [multica-gap-2026-07-17.md](./multica-gap-2026-07-17.md) |
| 方位 | [CONTEXT.md](../../CONTEXT.md) |
