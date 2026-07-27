# 下一阶段切片计划 · Phase B · 2026-07-27

> **方法：** 3 路探索子代理并行（后端健壮性 / 前端体验 / Multica·Hermes·Pi 对照）合并  
> **北星：** 本地 Multica 控制台体验（日常可用、少翻车），非 daemon/云 1:1  
> **前置：** [slice-plan-2026-07-27-next.md](./slice-plan-2026-07-27-next.md)（Slice **23–32 已收官**）· [slice32-issue-sheet-impl-1.md](./slice32-issue-sheet-impl-1.md)  
> **编号：** 续接 Slice 32 → **33+**  
> **本阶段主题：** **验收锁回归 → 恢复/安全补洞 → 手感债收口 → 编排纵深**

---

## 0. 阶段判断

| 判断 | 说明 |
|---|---|
| 主航道 | **已可用**（派活→执行→观测→恢复→Wiki/Memory→Settings） |
| Phase A（23–32） | **已合 main**：关停 · Memory 断路器 · 委派闸 · WS topic · 手感 · 价表 · 列表 virtual · 模板 · Wiki 复利 · Issue Sheet |
| 缺口性质 | 从「缺功能面」切到 **可靠性边角 + 手感覆盖不全 + 少量编排纵深** |
| 下一阶段主题 | **V 验收 → R 补洞 → U 手感债 → D 纵深** |
| 工程 | Slice Owner · 探索/实现子代理 · Playwright 关刀 · **main 直推** |

**刻意不做（仍有效）：** 云 webhook · Redis/多节点 · daemon 1:1 · 密钥入库/UI · 自造 agent loop · 大规模 BI · TipTap 全量富文本优先 · Wiki 图谱大屏优先 · 跨 Runtime Session 迁移

**Phase A 穿插未清（并入本计划，勿另开大刀）：**

| 旧 ID | 项 | 归入 |
|---|---|---|
| UX-a | 原生 select → 共用 Select | Slice 40 穿插 / Must 之一 |
| UX-b | WS 断线可行动条 | Slice 34 Must |
| Slice29 Out | Kanban 列内 virtual | Slice 37 |
| Slice32 续 | Sheet 过重（全量 IssueDetail） | Slice 36 |
| Slice27 残留 | 详情页裸 loading / Trap 不全 / Error 英文 | Slice 34 |

---

## 1. 四轨总览

```text
轨道 V 验收（先做）     轨道 R 健壮性补洞          轨道 U 日用手感债           轨道 D 纵深
V1 全栈 live Playwright  R4 恢复两洞(timeout/wait)  U4 三态+断线条+Trap        D5 Deferred 升级
                         R5 安全默认+healthz        U5 Issue Sheet 轻量         D6 Prompt 静态化
                         R6 transition+Wiki backoff U6 Kanban 列 virtual
                         R7 迁移单轨+关键集成测      U7 运维叙事+Select+Run 吸底
```

**默认顺序（推荐选项 A）：**

```text
V1 → U4 → R4 → U5 → U6 → R5 → R6 → U7 → R7 → D5 → D6
```

即：

```text
33 → 34 → 35 → 36 → 37 → 38 → 39 → 40 → 41 → 42 → 43
```

- **V1 不后置**：没有 live 证据不宣称 Phase A 完成态稳。  
- **U4 紧接 V1**：最低成本拉齐感知（可与 R4 分会话并行，但默认串行省冲突）。  
- **R4 恢复两洞** 优先于安全/迁移：直接堵「卡死后不能重试 / 队列假活」。  
- **D 轨** 不挡日用；人可整轨跳过。  
- 每刀结束写 `app/.progress/sliceNN-*-impl-1.md` + intake 建议下一刀。

---

## 2. 切片明细（Slice 33–43）

### 第零波 · 验收（V）

#### Slice 33 · 全栈 live Playwright 补验（V1）

| 项 | 内容 |
|---|---|
| **目标** | 证明 23–32 主路径在真起服务下可走通，锁回归基线 |
| **范围** | 现有 e2e 骨架扩展；本地 `pnpm dev` 或 test harness；关键路径脚本化 |
| **Must** | ① 派活→run 出现→状态推进（mock/真 CLI 其一写清） ② 看板 `?issue=` Sheet 开合 ③ WS 连上后至少一种列表 invalidate 可观测 ④ Settings 健康卡可读 ⑤ 失败如实记 flaky，不粉饰 ⑥ closeout 附命令与截图/日志路径 |
| **Out** | 新功能开发；全量 CLI 矩阵；云 CI 强制真 CLI |
| **来源** | CONTEXT 下一阶段点名 · slice32 closeout 后续项 |
| **复杂度** | 低–中 · **P0** |

---

### 第一波 · 手感债 + 恢复补洞（U/R 交错）

#### Slice 34 · 交互手感债收口（U4）

| 项 | 内容 |
|---|---|
| **目标** | 低成本高感知：加载/错误/空态一致；断线可行动；焦点不漏 |
| **范围** | 详情页骨架；`ErrorState` 中文；Empty 勿当 loading；WS banner；剩余 dialog FocusTrap |
| **Must** | ① Issue / Agent / Squad / Run 详情主路径无裸「加载中…」（用 Skeleton） ② `ErrorState` 默认中文文案 + 重试 ③ WS `closed/connecting` 可行动条：刷新本页 + 状态文案；恢复 `open` 可 toast 一次 ④ WikiQuery / Run 事件抽屉 / Memory 详情 / Helper（若 dialog）挂 `useFocusTrap` ⑤ Playwright：断线条可见 或 详情骨架断言至少 1 条路径 |
| **Out** | TipTap；整站 redesign；快捷键自定义 |
| **来源** | FE P0-1/P0-3 · F-05 残留 · UX-b · Slice27 债 |
| **复杂度** | **低** · **P0** |

#### Slice 35 · Run 恢复两洞（R4）

| 项 | 内容 |
|---|---|
| **目标** | 卡死收尸后能重试；waiting 路径不永久挂起 |
| **范围** | `run-service` retry 集合；`stale-runs` waiting 租约上限；列表/前端可重试过滤；Settings at-risk（若已有则接 waiting） |
| **Must** | ① `timed_out` 纳入可 retry（与 `failed\|cancelled` 对齐） ② `waiting_local_directory` 有 `waitingSince`/最大续租或墙钟上限，超时 → fail + inbox ③ 前端/API「可重试」与状态一致 ④ 单测：retry timed_out；waiting 超时 fail ⑤ 不破坏 path-lock 正常排队语义 |
| **Out** | 新 run 状态机大改；跨 host lease |
| **来源** | BE P0-1 / P0-2 · Multica 本地恢复体验 |
| **复杂度** | 低–中 · **P0** |

#### Slice 36 · Issue Sheet 轻量模式（U5）

| 项 | 内容 |
|---|---|
| **目标** | 看板侧滑=快速处置，不是第二全页 |
| **范围** | `IssueSideSheet` / `IssueDetail` 分 `variant="sheet" \| "page"`；Sheet 主操作 5 件套 |
| **Must** | ① Sheet 默认：标题/状态/指派/评论/最近 run（+ 必要错误条） ② 属性栏长卷、知识沉淀、完整执行日志等进「全页」或折叠 ③ 已有 `?issue=` / Esc / 全页深链不回归 ④ Playwright：看板点卡 → Sheet 内改状态或评论 MVP |
| **Out** | 全站实体侧滑化；重做 Issue 信息架构 |
| **来源** | Slice32 续摩擦 · Multica/Linear 节奏 |
| **复杂度** | 中 · **P1** |

#### Slice 37 · Kanban 列内虚拟滚动（U6）

| 项 | 内容 |
|---|---|
| **目标** | 百级 Issue 看板列仍顺滑 |
| **范围** | `KanbanColumn` + `@tanstack/react-virtual`；对齐列表 virtual 阈值策略 |
| **Must** | ① 单列 ≥40/≥200 卡 DOM 显著下降（阈值与 list 同策略或写清） ② 筛选后列数据正确 ③ 拖拽 MVP：可拖或明确降级（不可拖时 closeout 写清） ④ 列表 virtual 不回归 |
| **Out** | 服务端分页瀑布；跨列虚拟窗口统一 |
| **来源** | Slice29 Out · FE P0-2 · plan 穿插债 |
| **复杂度** | 中 · **P1** |

---

### 第二波 · 安全 / 状态机 / 运维叙事（R/U）

#### Slice 38 · 本地安全默认 + 进程健康面（R5）

| 项 | 内容 |
|---|---|
| **目标** | 默认只绑本机回环；进程级存活可探 |
| **范围** | `index.ts` bind 默认；CORS；可选 `MA_BIND` / 本地 token；`GET /healthz`（DB + workers 心跳摘要） |
| **Must** | ① 默认 listen `127.0.0.1`（可用 env 放开 `0.0.0.0`） ② CORS 默认收紧到 web origin（dev 可配） ③ `/healthz` 返回 ok/degraded + 关键 worker 上次 tick（或等价） ④ Settings 或文档一行说明如何局域网暴露 ⑤ 密钥仍不落库 |
| **Out** | 完整 OAuth；多用户 ACL；Prometheus 全集 |
| **来源** | BE P1-1 / P1-2 |
| **复杂度** | 低 · **P1** |

#### Slice 39 · Run 状态转移统一 + Wiki 退避（R6）

| 项 | 内容 |
|---|---|
| **目标** | 终态互盖可预期；Wiki 失败不刷爆 LLM |
| **范围** | 抽出 `run-transitions`（或等价 helper）：claim/cancel/fail/complete 查 `changes`；`ingest-queue` 指数退避 |
| **Must** | ① 关键 transition 0 changes = no-op（不伪成功事件） ② cancel/fail/timed_out/orphan 路径接 helper（覆盖面 closeout 列表） ③ Wiki fail → `nextAttemptAt` 退避；dead 策略保留 ④ 单测：双 tick claim；ingest 退避 |
| **Out** | 重写整个 orchestration；换队列中间件 |
| **来源** | BE P0-4 / P1-6 |
| **复杂度** | 中 · **P1** |

#### Slice 40 · 运维叙事 + Select + Run 观测收口（U7）

| 项 | 内容 |
|---|---|
| **目标** | Settings/Wiki/Memory 更像产品；高频表单去原生味；Run 失败一条叙事 |
| **范围** | Settings 顶栏导览/红项置顶；共用 Select 换指派·优先级·leader；Run 抽屉吸底 + 失败 CTA 优先级 |
| **Must** | ① Settings：健康红项置顶或「先做这 3 步」锚点 ② 至少指派/优先级（+ Squad leader 若触手可及）用共用 Select ③ Run 事件抽屉：近底才吸底；失败条「原因 + 首选恢复动作」 ④ Wiki jobs 裸 loading 改为骨架或统一三态 ⑤ 不引入密钥 UI |
| **Out** | 原型 1:1 双栏 Settings 重做；TipTap；Inbox 强制三栏 Helper |
| **来源** | FE P1-3–P1-6 · UX-a · Run 观测摩擦 |
| **复杂度** | 中 · **P1** |

#### Slice 41 · 迁移单轨 + 关键路径集成测（R7）

| 项 | 内容 |
|---|---|
| **目标** | schema 真源唯一；回归有锁 |
| **范围** | 去掉/收敛 `db/client.ts` 启动 inline ALTER；补 migration/snapshot；集成测骨架 |
| **Must** | ① 新库只靠 migrator 可到当前 schema（或 closeout 证明等价） ② inline ALTER 删除或仅留「已文档化的一次性兼容」并有拆除期限 ③ 至少 3 条集成/契约测：enqueue 硬闸 或 cancel 竞态、automation 幂等、orphan/timed_out 收尸之一 ④ CI 或 script 可发现 schema 漂移（最小：migrate 干净库 + typecheck） |
| **Out** | 换 Postgres 强制；大爆炸 rewrite 全表 |
| **来源** | BE P0-3 · 测试空白 |
| **复杂度** | 中 · **P1–P2** |

---

### 第三波 · 编排 / 成本纵深（D）

#### Slice 42 · Deferred 升级（D5）

| 项 | 内容 |
|---|---|
| **目标** | 指派后 N 分钟无人 claim/响应 → 惰性兜底（区别于失败后 escalation） |
| **范围** | 学 Multica deferred 语义的**本地简化版**：字段或旁路队列表 + sweeper；Inbox/活动日志 |
| **Must** | ① 可配置阈值（默认保守，防误升级噪声） ② 仅未进入有效执行的指派可 deferred 升级（写清状态谓词） ③ 升级可观测（inbox 或 activity）且可关闭规则 ④ 与现有 `escalateFailedSquadRuns` **不重复轰炸** ⑤ 单测时钟/阈值 |
| **Out** | Multica `fire_at` 协议 1:1；云调度 |
| **来源** | Multica deep deferred · 调研 E3 新发现 |
| **复杂度** | 中 · **P2** |

#### Slice 43 · Prompt 静态化（D6）

| 项 | 内容 |
|---|---|
| **目标** | system 静态可缓存；memory/临时上下文进 user 侧（学 Hermes） |
| **范围** | `runtime/prompt` / issue-prompt-context；各 backend 注入点对齐 |
| **Must** | ① 静态 system 与 per-run 动态块分离（文档 + 代码边界清晰） ② Memory/brief 等动态内容不默认污染静态 system ③ 至少 1 条 backend 路径可演示「换 memory 不改 system 前缀」 ④ 不自造 agent loop；不把密钥写进 prompt 落库 |
| **Out** | 全 provider token 级 cache 保证；跨 CLI 统一 session 迁移 |
| **来源** | Hermes prompt cache · gap B-07 · 调研 B2 |
| **复杂度** | 低–中 · **P2** |

---

## 3. 穿插打磨（不当独立大刀）

任意切片可顺带，**单条 ≤0.5 刀精力**：

| ID | 项 |
|---|---|
| UX-g | OS 孤儿 pid 再 taskkill（挂 R4/R6 若触达 spawn-line） |
| UX-h | API 错误 envelope 统一（挂 R5/R6 顺手抽 `ApiError`） |
| UX-i | 子进程 env allowlist 试点（单 runtime） |
| UX-j | 窄屏侧栏抽屉 MVP（≤1024，可后置整刀） |
| UX-k | Squad 轻 wizard（挂 U7 若有余力） |
| UX-l | 快捷键只读帮助已有则不扩自定义 |

---

## 4. 刀间规则

1. **一刀一端到端可演示**；Must 写进 closeout，失败如实记。  
2. **探索/实现优先子代理**；Owner 选型 + 路径验收 + Playwright + push main。  
3. **V/U 刀以 Playwright 路径验收**；**R 刀以故障注入/单测 + 最小脚本验收**。  
4. **宪法钉不破：** 纯本地、不自造 loop、DB 行即锁、密钥不落库、不改 `references/repos`。  
5. **窗满** `/handoff`；跨刀只信 progress closeout + 本计划。  
6. 若人否决某轨：跳过该轨，**不**自动用云 webhook / Redis / daemon 方案填坑。  
7. Phase A 文档（23–32 plan）保留只读；**排期真源以本文件为准**。

---

## 5. 里程碑与完成定义

| 里程碑 | 切片 | 完成时用户感知 |
|---|---|---|
| **M0 锁住** | 33 | 主路径 live 可重复跑，回归有基线 |
| **M1 不卡死** | 34–35 | 手感齐、断线知所措；timeout/waiting 可恢复 |
| **M2 看板顺** | 36–37 | 侧滑轻、大列不卡 |
| **M3 可运维** | 38–41 | 默认更安全、状态机干净、Settings/Run 叙事顺、schema 不漂 |
| **M4 更深** | 42–43 | 无人响应可兜底；长会话 prompt 更稳 |

**阶段达标：** M0+M1 完成后日用风险显著下降；M2 后看板体验接近 Linear 节奏；M3 后可再开全量 gap 审计；M4 按需。

---

## 6. 选项（人可改向）

| 选项 | 顺序 | 何时选 |
|---|---|---|
| **A 推荐** | 33→34→35→36→37→38→39→40→41→42→43 | 默认：先锁回归，再恢复与手感，后安全与纵深 |
| **B 恢复优先** | 33→35→34→… | 线上/日用已被 timeout/waiting 痛到 |
| **C 看板优先** | 33→36→37→34→… | 演示/大数据看板卡顿优先（恢复洞后置有风险） |
| **D 跳过纵深** | 做完 33–41 停 | 只收口债，不上 Deferred/Prompt |

**默认执行：A。** 未否决则下一 Owner 从 **Slice 33** 开刀。

---

## 7. 与调研条目映射（追溯）

| 调研 ID | 主题 | 切片 |
|---|---|---|
| B1 | timed_out 不可 retry | 35 |
| B2 | waiting 永久挂 | 35 |
| B3 | 迁移双轨 | 41 |
| B4 | transition 不查 changes | 39 |
| B5–B6 | bind/CORS · healthz | 38 |
| B9 | Wiki 无 backoff | 39 |
| F1/F3/F9/F10 | 三态 · 断线条 · Error 中文 · Trap | 34 |
| F2 | Kanban virtual | 37 |
| F4 | Sheet 过重 | 36 |
| F6–F8 | Run 吸底 · Settings 导览 · Select | 40 |
| Multica deferred | pre-claim 升级 | 42 |
| Hermes prompt cache | system 静态 | 43 |
| CONTEXT | live Playwright | 33 |

---

## 8. 下一 Owner 开场提示（复制即用）

```text
读 app/.progress/slice-plan-2026-07-27-phase-b.md 与 slice32 closeout。
按选项 A 开 Slice 33（全栈 live Playwright 补验）。
短对齐 Must/Out → 实现（可派子代理）→ 证据写入 closeout → push main。
不要做云 webhook / Redis / 密钥入库 / TipTap 全量。
下一刀默认 Slice 34（手感债收口）。
```

---

## 9. 修订记录

| 日期 | 变更 |
|---|---|
| 2026-07-27 | 初版 Phase B：验收 + 恢复/安全补洞 + 手感债 + 纵深（Slice 33–43） |
