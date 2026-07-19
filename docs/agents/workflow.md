# 工作流 — 自动迭代 Slice Owner

> 技能总路由：`/ask-matt`。  
> **默认编排（2026-07-17 人授权自动迭代）：**  
> Slice Owner **可自行** intake → **调研** → **选定下一刀** → implement → **Playwright** → **commit/push main**。  
> 交接：[slice-handoff.md](./slice-handoff.md) · 合码：[merge.md](./merge.md) · ADR 0001。

## 模型

```
人：北星 / 禁区 / 随时喊停
   │  （可不每刀点题）
   ▼
┌────────────────────────────────────────────┐
│  Slice Owner（自动迭代）                      │
│  1) intake 上一刀                             │
│  2) 调研（默认可主动：Multica 优先）            │
│  3) 列出选项 → **自行选最优** → 写进 progress   │
│  4) implement 厚切片                           │
│  5) Playwright 自测 → commit/push main → 关刀  │
└──────────────────┬───────────────────────────┘
                   │ 每 1～3 刀
                   ▼
            Multica 差距表 → 下一刀队列
```

| 角色 | 干什么 |
|---|---|
| **Slice Owner** | **自主**选题（在授权范围内）→ 调研 → **拍板选项** → 实现 → Playwright → main 直推 → 关刀 |
| **调研** | 默认可 **主动**跑；优先 `references/deep/multica.md` + 必要时 repos/子代理；Owner 只保留摘要 |
| **人** | 定北星与禁区；可不点每刀主题；可随时否决/改向/要求 feat 隔离 |
| **CI / review** | 可选；不挡 main 直推 |

## 自动迭代授权（选型与调研）

**人已授权（默认开启）：**

1. **主动调研** — 不必等人说「去调研」；路线不清、交互对不齐 Multica、或开新刀前，Owner **应先**查 Multica（deep → 必要时 repos），再动手。  
2. **自行选定下一刀** — 人未点题时，根据：上一刀债、CONTEXT 下一刀提示、**Multica 差距表**、日常可用价值，**直接选定一个厚切片**并实现。  
3. **选项拍板** — 实现中的 A/B（API 形状、UI 形态、是否做某附属）由 Owner **选最贴 Multica + 本仓约束** 的方案；写入 progress「决策记录」，**不必每步等人**。  
4. **main 直推** — 关刀证据齐后 push main（见 [merge.md](./merge.md)）。

**仍须停下来问人的情况（否决权 / 升级）：**

| 升级 | 例子 |
|---|---|
| 难逆架构 | 推翻「不自造 agent loop / 纯本地 / DB 行锁 / 多态指派」等宪法钉 |
| 安全与数据 | 密钥、外发用户数据、破坏性迁移无回滚 |
| 范围爆炸 | 一刀变平台级重构；或同时开两条无关产品线 |
| 人明确禁区 | CONTEXT / 会话里写过的「不要做 X」 |

**不升级、自行拍板即可：** 字段命名、筛选 URL 形态、badge 文案、是否加系统 comment、组件拆分、测试端口、文档路径等。

## 北星（迭代约束）

**最终任务：** 产出**日常可用**的纯本地编排控制台——**复刻本地版 Multica 的控制台体验**（派活、小队、run 可观测与恢复、Wiki/Memory、Settings 诊断），**不抄云托管，不对标 Multica daemon/云协议 1:1**。

| 约束 | 要求 |
|---|---|
| **垂直切片** | 一刀 = 一条可演示用户路径（契约+API+UI 同刀） |
| **关刀自测** | **Playwright CLI** 走通 Must；证据进 `app/.progress/<slug>-impl-*.md` |
| **调研驱动** | 不确定 → 先 Multica **体验层**（UI/运维路径）；摘要 + **推荐选项** + **已选哪项** 写入 progress |
| **合码** | 默认 **main 直推**；可选 feat 隔离 |
| **完成边界** | 密钥 env-only、无 webhook 舰队、Backend adapter 差异 = **刻意边界**，不列为「未完成主航道债」 |

**Playwright 关刀门禁：** typecheck 绿；`localhost:3000` + API `localhost:3001`；核心路径 DOM/URL/API 有记录；浏览器失败则 API smoke + 标有条件通过。

**Multica 对照：** 每 1～3 刀或关刀时附短差距表。表须区分 **体验可演进** vs **刻意不做**。禁止 Owner 窗灌大段上游源码。

## 硬顺序（跨刀 / 自动续刀）

1. intake 上一刀（含 Playwright 证据是否齐）  
2. 通过 / 有条件通过 / 需返工  
3. **调研（可主动）** → 选项表 → **记录选定**  
4. implement → Playwright → push **main** → 关刀  
5. CONTEXT 更新「再下一刀」建议（下任可直接开干）  

续作同刀（窗满）：`/handoff`，不换主题；关刀仍要 Playwright。

## Grill / 调研

- 满血 grill **非默认**。  
- **默认主动调研** Multica；子代理可选，摘要进 progress。  
- 主参考：**Multica**；辅：hermes / pi / `chanpin/prototype`。

## 合码

见 [merge.md](./merge.md)：默认 main 直推。

## 启动提示词（自动迭代）

```markdown
你是本仓 Slice Owner（自动迭代模式，见 docs/agents/workflow.md）。
- 可主动调研 Multica 并自行选定下一厚切片与实现选项
- 关刀前 Playwright 自测；默认可 commit/push main
- 难逆架构 / 安全 / 人禁区才停问
先 intake 上一刀，再开下一刀；进度写 app/.progress 与 CONTEXT。
```
