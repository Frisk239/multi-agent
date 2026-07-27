# 下一阶段切片计划 · Phase C · 2026-07-27

> **方法：** 2 路探索子代理并行（后端健壮性 / 前端体验）+ Multica·Hermes·Pi 对照，源码复核后合并  
> **北星：** 本地 Multica 控制台体验（日常可用、少翻车、可信），非 daemon/云 1:1  
> **前置：** [slice-plan-2026-07-27-phase-b.md](./slice-plan-2026-07-27-phase-b.md)（Slice **33–43 已收官**）· [queue-23-43-phase-b-closeout-2026-07-27.md](./queue-23-43-phase-b-closeout-2026-07-27.md)  
> **编号：** 续接 Slice 43 → **44+**  
> **本阶段主题：** **诚实失败 → 高频手感摩擦 → 安全默认 → 队列 lease / Resume 诚实 → 运维面收口**

---

## 0. 阶段判断

| 判断 | 说明 |
|---|---|
| 主航道 | **已可用**（派活→执行→观测→恢复→Wiki/Memory→Settings） |
| Phase A（23–32） | **已合 main** |
| Phase B（33–43） | **已合 main**：live Playwright 基线 · 手感债 · 恢复两洞 · Sheet 轻量 · 列 virtual · bind/healthz · transitions+Wiki 退避 · Select/运维叙事 · 迁移单轨 · Deferred 可观测 · Prompt 静态化 |
| 缺口性质 | 从「补洞/手感覆盖」切到 **正确性诚实 + 日用写操作不丢 + 盯板一眼可见 + 安全默认加固** |
| 下一阶段主题 | **H 诚实 → U 手感 → S 安全/Resume → O 运维** |
| 工程 | Slice Owner · 探索/实现子代理 · Playwright 关刀 · **main 直推** |

**刻意不做（仍有效）：** 云 webhook · Redis/多节点 · daemon 1:1 · 密钥入库/UI · 自造 agent loop · 大规模 BI · TipTap 全量优先 · Wiki 图谱大屏优先 · 跨 Runtime Session 迁移 · 合规级 human attribution · Multica Hub 三房间重做

**Phase B 后仍开放（并入本计划，勿另开大刀）：**

| 旧 ID | 项 | 归入 |
|---|---|---|
| B-01 残差 | Pi 假完成；resume 策略与 backend 分裂 | Slice 44 / 50 |
| B-02 房间 | topic 已够日用 | **不做**（刻意） |
| B-06/09 | ToolRegistry / 双层消息 | Phase C Out；远期 D |
| F-01 部分 | @mention 编辑态 chips（非 TipTap） | Slice 54 |
| F-04 部分 | 看板/批量裸 select 收口 | Slice 52 |
| F-09 部分 | 窄屏侧栏抽屉 | Slice 53 |
| 新发现 | 草稿丢失 · 看板卡无 live · confirm 原生 · Wiki running 无 lease · 局域网无 token · ops 面薄 | 44–51 |

**过时勿再当主菜：** B-04 成本归因主体 · B-07 Prompt 逻辑边界 · B-08 Cron · F-02/03/05/06/07/10 · Phase B 33–43 已交项。

---

## 1. 四轨总览

```text
轨道 H 诚实正确性        轨道 U 日用手感           轨道 S 安全/Resume         轨道 O 运维面
H1 假成功 Backend 归零   U8 草稿持久化            S1 本地 token（放开 bind）  O1 Ops snapshot + 探针去 stub
H2 Wiki running lease    U9 看板卡 live 态        S2 Resume 能力矩阵
                         U10 ConfirmDialog 统一
                         U11 看板 Select/批量条
                         U12 快捷键 + 窄屏侧栏
                         U13 Mention chips 薄版
```

**默认顺序（推荐选项 A）：**

```text
H1 → U8 → U9 → H2 → U10 → S1 → S2 → O1 → U11 → U12 → U13
```

即：

```text
44 → 45 → 46 → 47 → 48 → 49 → 50 → 51 → 52 → 53 → 54
```

- **H1 不后置**：假成功直接砸 Mission Control 信任。  
- **U8/U9 紧接 H1**：写不丢 + 板上看得到活 = 最高频感知。  
- **H2 在 U9 后**：队列 lease 偏后端，可与 U10 分会话并行，默认串行省冲突。  
- **S1 在「能用」之后**：默认 127.0.0.1 已安全；token 针对 `0.0.0.0` 暴露。  
- **S2 Resume** 不挡草稿/盯板；多 CLI 用户优先时可将 50 前移到 47 后。  
- **O1** 收口可观测，适合中段或与 S2 互换。  
- **U11–U13** 不挡正确性/安全；人可砍轨或整刀跳过。  
- 每刀结束写 `app/.progress/sliceNN-*-impl-1.md` + intake 建议下一刀。

**可选加速（选项 B · 双会话）：**

```text
会话甲（后端）：44 → 47 → 49 → 50 → 51
会话乙（前端）：45 → 46 → 48 → 52 → 53 → 54
```

合并点：甲 47 与乙 46 后做一次 live Playwright 烟测；S1/S2 仍建议甲串行。

---

## 2. 切片明细（Slice 44–54）

### 第一波 · 诚实 + 最高频手感（H/U）

#### Slice 44 · 假成功 Backend 归零（H1）

| 项 | 内容 |
|---|---|
| **目标** | 不完整 / 未实现的 Runtime 不得静默 `completed` |
| **范围** | `runtime/pi.ts` 及 registry 中同类 stub；readiness/detect 文案；失败错误可读 |
| **Must** | ① Pi（及明确未实现 execute 的 backend）派发 → 终态 `failed`（或等价不可执行），**禁止** silent completed ② error/message 说明「未实现/未安装」 ③ readiness：不可执行时不标「可派活绿」或写清 not-runnable ④ 单测：execute 路径不返回假 completed ⑤ typecheck |
| **Out** | 真实现 Pi SDK loop；全 CLI 能力追平 |
| **来源** | BE P0-1 · Multica backend 真实 Execute |
| **复杂度** | **低** · **P0** |
| **验收** | 单测 + 可选 live：建 Pi agent → run → failed 可读 |

#### Slice 45 · 草稿持久化（U8）

| 项 | 内容 |
|---|---|
| **目标** | 评论 / Chat / 新建 Issue 半成品不因刷新、关 Sheet、切 thread 丢失 |
| **范围** | `CommentComposer`、`ChatPage` draft、`NewIssue`（或等价）；localStorage（或现有 client store） |
| **Must** | ① key 至少覆盖 `comment:{issueId}` / `chat:{threadId}` / `new-issue`（工作区维度若多 workspace 需写清） ② 输入 debounce 落盘；挂载恢复 ③ 发送/成功创建后清除 ④ 关 Sheet / 刷新后仍在 ⑤ Playwright 至少 1 条：输入 → 刷新或重挂 → 文案仍在 |
| **Out** | 服务端草稿同步；多人协作草稿 |
| **来源** | FE P0-1 · Multica comment-draft-store |
| **复杂度** | **低** · **P0** |

#### Slice 46 · 看板卡 live 态（U9）

| 项 | 内容 |
|---|---|
| **目标** | 盯板一眼看到 running / failed，不必点进 Sheet |
| **范围** | `IssueCard` / `KanbanBoard` 已有 runs 聚合数据出口；复用 `AgentStatusBadge` 或 micro 指示 |
| **Must** | ① 有 active/running run 的卡：可见 live 标记（呼吸/脉冲，`data-live` 或 testid） ② 最近失败可区分（红点/条），点击进 `?issue=` 或失败区 ③ 无 run 时不噪声 ④ 列 virtual / 拖拽不回归 ⑤ Playwright：造 running（或 mock 数据）→ 卡上 live 断言 |
| **Out** | 全站实体脉冲 redesign；agent 工作仪表盘重做 |
| **来源** | FE P0-2 · Multica board activity indicator · F-07 卡面缺口 |
| **复杂度** | **低–中** · **P0** |

---

### 第二波 · 队列 lease + 确认手感（H/U）

#### Slice 47 · Wiki running lease（H2）

| 项 | 内容 |
|---|---|
| **目标** | 运行中挂死的 ingest 能回到 pending/退避，不永久堵同 issue |
| **范围** | `wiki/ingest-queue.ts` / `ingest-worker.ts`；健康字段可选 |
| **Must** | ① `running` 超过可配墙钟/lease → 回 `pending`（或 fail+backoff 策略写清）并计 failCount ② 与现有 `nextAttemptAt` / dead / bulk retry 兼容 ③ 启动 recover 与运行中 lease 语义不双杀 ④ 单测：时钟推进 stuck running ⑤ closeout 写默认阈值与 env |
| **Out** | 多 worker 并发 ingest；换队列中间件 |
| **来源** | BE P1-1 · Multica lease / FailStale |
| **复杂度** | **低–中** · **P0–P1** |

#### Slice 48 · ConfirmDialog 统一 + 指派减噪（U10）

| 项 | 内容 |
|---|---|
| **目标** | 去掉日用路径上的 `window.confirm` 廉价感；危险操作仍可键盘确认 |
| **范围** | 新建共用 `ConfirmDialog`（挂已有 focus trap）；指派 / 停 run / 删除等高频点 |
| **Must** | ① 共用对话框：标题/说明/确认取消、Esc、焦点 trap ② **ready 指派**默认不再 browser confirm（toast 或轻确认策略写清） ③ 删除 / 不可逆 / git dirty 硬闸保留二次确认（组件化） ④ 至少替换：指派主路径 + 批量删除或停 run 之一 ⑤ Playwright：ready 指派无 `window.confirm`；删除仍需确认 |
| **Out** | 全仓每一个 confirm 扫荡到 0（可列残留）；重做全部 modal 体系 |
| **来源** | FE P0-3 |
| **复杂度** | **中** · **P1** |

---

### 第三波 · 安全 / Resume / 运维（S/O）

#### Slice 49 · 本地 token（放开 bind 时）（S1）

| 项 | 内容 |
|---|---|
| **目标** | `MA_BIND=0.0.0.0` 时 API/WS 不裸奔；默认回环行为不变 |
| **范围** | server bind/cors 既有；HTTP 鉴权中间件；WS 握手；Settings/文档一行 |
| **Must** | ① env `MA_LOCAL_TOKEN`（名可微调，closeout 钉死） ② 非 loopback 或显式要求时：无 token → 401/关闭 WS ③ loopback 默认仍可无 token 日用（或 closeout 明确「始终可选校验」二选一，**推荐：仅非 loopback 强制**） ④ 启动 log：0.0.0.0 且无 token → **警告** ⑤ 密钥不落库、不进 UI 表单存盘 ⑥ 单测：有/无 token |
| **Out** | OAuth；多用户 ACL；Prometheus 鉴权 |
| **来源** | BE P0-2 · Phase B Slice 38 续 |
| **复杂度** | **中** · **P1** |

#### Slice 50 · Resume 能力矩阵（S2）

| 项 | 内容 |
|---|---|
| **目标** | session resume 策略与各 Backend 真实能力一致，不装会 |
| **范围** | `session-resume.ts`、`run-worker` 注入、`opencode`/`cursor`/`claude`/`grok`；前端 unsupported 文案若有 |
| **Must** | ① 能力表 `supportsSessionResume`（或等价）按 runtime 声明 ② 支持的 runtime：真 resume + resume_miss 可观测 ③ 不支持：不传假参数路径 / 明确 unsupported（与现状 claude-only 对齐或有据扩展） ④ 单测扩 runtime 表 ⑤ 重跑/ Prior session 路径不回归 claude |
| **Out** | 跨 Runtime 迁移 session；自造 transcript 存储 |
| **来源** | BE P0-3 · B-01 残差 |
| **复杂度** | **中** · **P1** |

#### Slice 51 · Ops snapshot + live-probes 去 stub（O1）

| 项 | 内容 |
|---|---|
| **目标** | 一张运维 JSON 可排障；Settings 探针不再假数据 |
| **范围** | `/api/ops/snapshot` 或扩展 `/healthz`；`settings` live-probes；可选 Settings 卡挂载 |
| **Must** | ① snapshot 至少含：active/queued runs（+ 队列年龄摘要）、wiki dead/pending、memory breaker、worker 上次 tick、automation last error（有则） ② `live-probes` 去掉 `_stub: true`，接真实 detect/readiness ③ Settings 可读到上述之一（新卡或并入健康） ④ 不引入密钥 UI ⑤ 单测或契约测 1 条 |
| **Out** | 完整 Prometheus/Grafana；大规模 BI |
| **来源** | BE P1-4 / P1-5 / P1-8 |
| **复杂度** | **低–中** · **P1** |

---

### 第四波 · 手感收口（U · 可砍）

#### Slice 52 · 看板 Select / 批量条收口（U11）

| 项 | 内容 |
|---|---|
| **目标** | 完成 F-04 日用面：看板筛选与批量操作去原生味 |
| **范围** | `KanbanBoard` 筛选 select；批量状态/指派；批量条布局 |
| **Must** | ① 看板主筛选控件改用共用 `Select`（或文档化残留） ② 批量改状态/指派手感一致；Esc 清选 ③ 不引入 combobox 大重做 ④ Playwright：bulk 改 status 或筛选外观路径 1 条 |
| **Out** | 全站 ~40 处 select 扫零；radix combobox |
| **来源** | FE P1-2 · F-04 · Slice 40 续 |
| **复杂度** | **低–中** · **P1** |

#### Slice 53 · 快捷键扩面 + 窄屏侧栏（U12）

| 项 | 内容 |
|---|---|
| **目标** | 重度键盘用户少点侧栏；笔记本分屏可干活 |
| **范围** | `use-shortcuts` + 帮助 modal；`Sidebar` 窄屏 |
| **Must** | ① 至少新增 `g c` Chat、`g a` Agents（或 `g w` Wiki）之一组写清 ② 帮助 modal 与映射同步 ③ ≤900px（阈值 closeout 钉）：侧栏默认隐 + 汉堡 + overlay，Esc/点遮罩关 ④ Playwright：快捷键路由或 viewport 侧栏 二选一优先键盘 |
| **Out** | 快捷键自定义设置页（旧 GAP-07 仍后置）；移动 App |
| **来源** | FE P1-3 / P1-4 · F-09 |
| **复杂度** | **中** · **P2**（可拆两刀：53a 键 / 53b 窄屏） |

#### Slice 54 · Mention chips 薄版（U13）

| 项 | 内容 |
|---|---|
| **目标** | Squad 委派评论编辑时扫清「@ 了谁」，不上 TipTap |
| **范围** | `CommentComposer`：已提及 sticky chips 可点删；与现有 `@` 补全/预览对齐 |
| **Must** | ① 选择 mention 后编辑区下方（或内）chip 可见 ② 可删 chip 并同步 markdown 文本 ③ 发送后 timeline/`MarkdownBody` 仍正确 ④ Playwright：@ 选择 → chip → 发送 |
| **Out** | TipTap 全量；附件上传管线；hover card 1:1 Multica |
| **来源** | FE P1-1 · F-01 收口 |
| **复杂度** | **中** · **P2** |

---

## 3. 穿插与依赖

```text
44（假成功） ─┬► 45 草稿 ─► 46 看板 live ─┬► 48 Confirm
              │                            ├► 52 Select/批量
              └► 47 Wiki lease ─► 49 token ─► 50 Resume ─► 51 Ops
                                                      │
53 键/窄屏 · 54 chips ───────────────────────────────┴► 不挡 S/O
```

| 依赖 | 说明 |
|---|---|
| 46 → 52 | 弱依赖；live 标记勿被批量条 CSS 盖住即可 |
| 49 → 前端 | 若强制 header token，web dev proxy/`fetch` 需读同 env 或仅非 loopback 测 |
| 50 | 可与 51 对调；勿与 44 混刀（关注点不同） |
| 54 | 依赖 45 草稿 key 不冲突；可先 45 后 54 |

---

## 4. 每刀工程约定

| 项 | 约定 |
|---|---|
| 实现 | 优先实现子代理；Owner 路径验收 |
| 质量门 | `pnpm typecheck` + 相关单测；有 UI 则 Playwright 或脚本 1 条 |
| Git | 默认可 **main** commit + push（[merge.md](../../docs/agents/merge.md)） |
| 文档 | `app/.progress/sliceNN-<slug>-impl-1.md`；更新本计划勾选或 closeout 队列 |
| 回归 | 复跑 Slice 33 基线命令（或子集）当改 run/wiki/ws 时 |

---

## 5. 达标判断（Phase C 结束时）

| 维度 | 目标 |
|---|---|
| 信任 | 无已知 stub backend 假完成；resume 能力表与行为一致 |
| 日用 | 评论/Chat 草稿不丢；看板 running/failed 可见；指派少原生 confirm |
| 安全 | 非 loopback 暴露有 token 或明确警告路径 |
| 队列 | Wiki running 卡死可恢复 |
| 运维 | snapshot/探针非 stub，Settings 可看 |
| 仍不做 | 云 webhook · TipTap 全家桶 · Wiki 图谱 · daemon 1:1 |

---

## 6. 远期池（Phase C 不排期 · 备忘）

| 项 | 备注 |
|---|---|
| ToolRegistry 可视化 | Hermes；需先有稳定 tool 事件出口 |
| AgentMessage 双层 | Pi；大改 run_message |
| Memory scope/rerank | mem0；本地单用户收益有限 |
| Deferred 真状态机 / 自动 reassign | Multica deferred+fire_at；现可观测足够 |
| waiting_local 进入时刻字段 | 小刀可挂 47 或 51 穿插 |
| failureReason 枚举对齐 | 可挂 51 或独立 chore |
| 附件上传 | 先确认 server 存储再做 UI |
| 快捷键设置页 / Inbox 默认可行动 | GAP-07/08 残留 |
| TipTap / Wiki 图谱 | 明确产品要再开 |

---

## 7. 与文档入口

| 文档 | 关系 |
|---|---|
| [CONTEXT.md](../../CONTEXT.md) | 方位指向本计划 |
| [multica-gap-2026-07-17.md](./multica-gap-2026-07-17.md) | 滚动差距表「体验可演进」→ Phase C |
| [gap-analysis-full-2026-07-26.md](./gap-analysis-full-2026-07-26.md) | 历史全量；多数 ID 已过时，仅作索引 |
| Phase B 计划 / closeout | 只读前置 |

**默认下一刀：Slice 44 · 假成功 Backend 归零。**
