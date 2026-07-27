# 下一阶段切片计划 · 2026-07-27

> **方法：** 4 路子代理并行调研（后端 / 前端 / Multica / Hermes·Pi·Wiki 横向）合并  
> **北星：** 本地 Multica 控制台体验（日常可用、少翻车），非 daemon/云 1:1  
> **前置：** [gap-analysis-full-2026-07-26.md](./gap-analysis-full-2026-07-26.md) · 上一刀 [slice22-subagenttree-impl-1.md](./slice22-subagenttree-impl-1.md)  
> **编号：** 续接 Slice 22 → **23+**（与 7/26 规划的 S1–S8 编号脱钩；S1–S8 多数已落地）

---

## 0. 阶段判断

| 判断 | 说明 |
|---|---|
| 主航道 | **已可用**（派活→执行→观测→恢复→Wiki/Memory→Settings） |
| 7/26 规划 S1–S8 | **大多已合**（富评@ / 脉冲 / Token 面板 / 字段 / CLI 均衡 / Cron / 子代理树）；Builder 半落地 |
| 下一阶段主题 | **健壮性 → 日用手感 → 纵深能力**，不再堆大功能面 |
| 工程 | Slice Owner · 探索/实现子代理 · Playwright 关刀 · **main 直推** |

**刻意不做（仍有效）：** 云 webhook · Redis/多节点 · daemon 1:1 · 密钥入库/UI · 自造 agent loop · 大规模 BI · TipTap 全量富文本优先 · Wiki 图谱大屏优先

---

## 1. 三轨总览

```text
轨道 R 健壮性（先做）     轨道 U 日用体验（紧接）      轨道 D 纵深（其后）
R1 进程生命周期           U1 WS 轻量订阅+重连按页       D1 看板虚拟滚动
R2 Memory 写可靠+断路器   U3 手感包（吸底/Trap/空错载） D2 Agent 模板库收官
R3 委派边界 hardening     U2 模型价表成本纵深           D3 Wiki 复利
                                                      D4 Issue 侧滑 Sheet
```

**默认顺序（推荐选项 A）：**

```text
R1 → R2 → R3 → U1 → U3 → U2 → D1 → D2 → D3 → D4
```

- **R 与 U 可在 R1 后穿插**（例如 R2 与 U3 并行会话），但 **R1 不后置**。  
- **D4 侧滑** 可与 D1 互换；**D3 Wiki** 不挡控制台日用。  
- 每刀结束写 `app/.progress/sliceNN-*-impl-1.md` + intake 建议下一刀。

---

## 2. 切片明细（Slice 23–32）

### 第一波 · 健壮性（R）

#### Slice 23 · 进程生命周期硬化（R1）

| 项 | 内容 |
|---|---|
| **目标** | 关停/崩溃不留脏 run、不留孤儿进程 |
| **范围** | `server/src/index.ts` 优雅退出；active run cancel → `killTree` → DB 终态；与 `stale-runs` / `spawn-line` 对齐 |
| **Must** | ① SIGINT/SIGTERM 后 active run 进入终态 ② 超时仍 killTree ③ 重启后 orphan 收尸可演示=0 或仅历史 ④ typecheck + 最小自动化/脚本验收 |
| **Out** | 多节点、外部 process supervisor |
| **来源** | BE-02 / BE-03 |
| **复杂度** | 中 · **P0** |

#### Slice 24 · Memory 写可靠 + 断路器（R2）

| 项 | 内容 |
|---|---|
| **目标** | Memory 同步/沉淀不拖垮 run，失败可冷却 |
| **范围** | `memory/manager` 全局写队列 concurrency=1；连续失败 breaker；Settings/健康可见状态 |
| **Must** | ① 并发 run 完成时 memory 写串行 ② N 次失败后跳过注入/写入一段时间 ③ 健康面能看到 breaker open/closed ④ 单测覆盖队列/熔断 |
| **Out** | 换 Memory 引擎、上 Graphiti |
| **来源** | H1 / H2 |
| **复杂度** | 中 · **P0** |

#### Slice 25 · 委派边界 hardening（R3）

| 项 | 内容 |
|---|---|
| **目标** | 子代理 fan-out 可控、不绕硬闸、不炸 prompt |
| **范围** | `subagent-dispatch`：depth 上限；子 run `skipMemory`；摘要 cap；无 issue 路径也走 readiness/cwd 闸 |
| **Must** | ① depth≥K 拒绝并写清错误 ② 子 run 默认不 memory 注入 ③ 父侧 summary 有长度上限 ④ 无 issue 委派不再旁路硬闸 ⑤ 单测 |
| **Out** | 新委派 UI（树已有 Slice 22） |
| **来源** | H4 / BE-08 |
| **复杂度** | 中 · **P0** |

---

### 第二波 · 日用体验（U）

#### Slice 26 · WS 轻量订阅 + 重连按页刷新（U1）

| 项 | 内容 |
|---|---|
| **目标** | 实时更轻、重连不闪全站 |
| **范围** | 服务端可选 topic 过滤（`run:/issue:/agent:`）；前端 subscribe + `ws.ts` 按 pathname invalidate；兼容旧全量客户端 |
| **Must** | ① 详情页高频 stream 不拖垮他页查询 ② 重连只刷新当前路由相关 query ③ 旧行为可退化兼容 ④ Playwright：连/断/重连后列表稳定 |
| **Out** | Redis room、Multica Hub 1:1 |
| **来源** | BE-01 / E-01 / FE-05 |
| **复杂度** | 中 · **P1** |

#### Slice 27 · 交互手感包（U3）

| 项 | 内容 |
|---|---|
| **目标** | 低成本高感知：Chat/弹窗/空错载 |
| **范围** | Chat 近底吸底 +「↓ 新消息」；`useFocusTrap` 挂 CmdK/QC/NewIssue/Shortcuts 等；Agents/Squads/Skills/MyIssues 等统一 Skeleton + ErrorState |
| **Must** | ① 上滑超过阈值停止自动滚 ② dialog Tab 不漏到背后、Esc 归还焦点 ③ 主列表页无裸「加载中…」主路径 ④ Playwright 覆盖 Chat 吸底 + 一个 modal trap |
| **Out** | TipTap、整站 redesign |
| **来源** | FE-02 / FE-04 / FE-06 / FE-07 / E-09 |
| **复杂度** | **低** · **P1** · 可与 R2 穿插 |

#### Slice 28 · 模型价表成本纵深（U2）

| 项 | 内容 |
|---|---|
| **目标** | 成本可解释：按 model 计价 + uncosted 诚实 |
| **范围** | 本地 `model-rates`（文件/env）；Run `costUsd`；analytics/usage 按 issue/agent/project；Issue/Run chip |
| **Must** | ① 可配置价表 ② 无价表 model 显示 uncosted 非假 0 ③ 换 model 费用变化可解释 ④ 密钥仍不落库 |
| **Out** | 云账单、合规 attribution 链 |
| **来源** | BE-04 / E-02 |
| **复杂度** | 中 · **P1** |

---

### 第三波 · 纵深（D）

#### Slice 29 · 看板/列表虚拟滚动（D1）

| 项 | 内容 |
|---|---|
| **目标** | 百级 Issue 仍顺滑 |
| **范围** | 列表视图优先 virtual，再 Kanban 列内；`@tanstack/react-virtual` |
| **Must** | ① ≥200 issue DOM 显著下降 ② 筛选/排序不坏 ③ 拖拽 MVP：列表先稳，board 可第二小步 |
| **Out** | 服务端无限瀑布（可另开） |
| **来源** | FE-01 / E-04 |
| **复杂度** | 中 · **P1** |

#### Slice 30 · Agent 模板库收官（D2）

| 项 | 内容 |
|---|---|
| **目标** | Builder 从「3 硬编码」到可一键物化 |
| **范围** | `agent-templates` 静态清单 + list/create API；`AgentBuilderWizard` 接模板；中文收尾 |
| **Must** | ① ≥8 本地高频模板 ② 30s 内从模板创建可用 Agent ③ 无密钥入库 ④ closeout 文档补 Slice21 债 |
| **Out** | 云模板市场、Composio |
| **来源** | BE-05 / E-03 / FE-15 |
| **复杂度** | 中 · **P2** |

#### Slice 31 · Wiki 复利（D3）

| 项 | 内容 |
|---|---|
| **目标** | 少重复 ingest、知识可回写 |
| **范围** | content hash 跳过；query「存为页」；相关页/index/log 更新纪律 |
| **Must** | ① 相同内容不重复进队列 ② query 可落 `query-*.md` + log ③ health 仍可扫矛盾 |
| **Out** | vis.js 图谱大屏、跨项目全集索引 |
| **来源** | H13–H15 / BE-11 |
| **复杂度** | 中 · **P1–P2** |

#### Slice 32 · Issue 侧滑 Sheet（D4）

| 项 | 内容 |
|---|---|
| **目标** | 看板不丢上下文看详情 |
| **范围** | 看板/列表点卡 → 右侧 Sheet；URL `?issue=`；保留 `/issues/[id]` 深链 |
| **Must** | ① Esc 关闭 ② 深链全页仍可用 ③ 指派/状态/评论主操作在 Sheet 可完成 MVP |
| **Out** | 全站所有实体侧滑化 |
| **来源** | FE-08 / E-05 |
| **复杂度** | 高 · **P2** |

---

## 3. 穿插打磨（不当独立大刀）

任意切片可顺带，**单条 ≤0.5 刀精力**：

| ID | 项 |
|---|---|
| UX-a | 原生 select → 共用 Select（指派/优先级优先） |
| UX-b | WS 断线可行动条（重试当前视图） |
| UX-c | runtime detect 30–60s 缓存（H6） |
| UX-d | 结构化日志 requestId/runId（BE-13） |
| UX-e | AgentBuilder 中英文案统一 |
| UX-f | 快捷键只读页已有则不扩自定义 |

---

## 4. 刀间规则

1. **一刀一端到端可演示**；Must 写进 closeout，失败如实记。  
2. **探索/实现优先子代理**；Owner 只留选型 + 路径验收 + Playwright + push main。  
3. **R 刀以故障注入验收**（杀进程 / 双 run 完成 / 深委派）；**U/D 刀以 Playwright 路径验收**。  
4. **宪法钉不破：** 纯本地、不自造 loop、DB 行即锁、密钥不落库、不改 `references/repos`。  
5. **窗满** `/handoff`；跨刀只信 progress closeout + 本计划，不靠聊天记忆。  
6. 若人否决某轨：跳过该轨，**不**自动用云 webhook / Redis 方案填坑。

---

## 5. 里程碑与完成定义

| 里程碑 | 切片 | 完成时用户感知 |
|---|---|---|
| **M1 不翻车** | 23–25 | 关服务、杀 run、记 memory、深委派可预期 |
| **M2 日用顺** | 26–28 | 实时轻、手感稳、费用说得清 |
| **M3 更深** | 29–32 | 大板不卡、建 Agent 快、Wiki 复利、看板不丢上下文 |

**阶段达标（体验边界内）：** M1+M2 完成后可再开全量 gap 审计；M3 按需，不阻塞日用。

---

## 6. 选项（人可改向）

| 选项 | 顺序 | 何时选 |
|---|---|---|
| **A 推荐** | R1→R2→R3→U1→U3→U2→D… | 默认：天天用、少翻车 |
| **B 手感优先** | U3→D1→R1→… | 卡多/演示手感先痛 |
| **C 创建叙事** | D2→D4→U1→… | 获客/导航优先（稳定性风险更高） |

**默认执行：A。** 未否决则下一 Owner 从 **Slice 23** 开刀。

---

## 7. 下一 Owner 开场提示（复制即用）

```text
读 app/.progress/slice-plan-2026-07-27-next.md 与 slice22 closeout。
按选项 A 开 Slice 23（进程生命周期硬化）。
短对齐 Must/Out → 实现（可派子代理）→ typecheck + 验收 → closeout → push main。
不要做云 webhook / Redis / 密钥入库。
```

---

## 8. 修订记录

| 日期 | 变更 |
|---|---|
| 2026-07-27 | 初版：调研合并后 10 刀三轨计划（23–32） |
