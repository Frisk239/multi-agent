# S12 设计 spec — 产品硬化（Chrome + 执行/编排 + 薄 Inbox）

> 状态：草案（待用户复核） · 日期：2026-07-17 · 切片：S12（Phase 4a：MVP→可用产品）· 建议分支：`feat/s12-product-hardening`
> 真源依据：[AGENTS.md](../../../AGENTS.md) · [design/roadmap.md](../../../design/roadmap.md) Phase 4 · [docs/audit/2026-07-15-cross-slice-audit.md](../../audit/2026-07-15-cross-slice-audit.md) · [references/deep/multica.md](../../../references/deep/multica.md) · [chanpin/prototype](../../../chanpin/prototype/) · S01–S11 已交付能力
> 产出流程：brainstorming（本文件）→ writing-plans → 执行者拆分
> **定位：** 查缺补漏 + 参考项目 UX/功能补强；**产品可用**优先，非答辩专项。Playwright CLI 用于探索式验收，**不固化**仓库内 e2e 套件。

## 0. 摘要

S01–S11 已纵向打通编排 / 执行 / Wiki / 记忆。S12 补**产品层**：

1. **Chrome 硬化** — toast、空态、可指派新建 Issue、Ctrl+K、WS/忙碌指示、错误边界、诚实导航  
2. **执行与编排** — 消费 `run:progress`；Squads 列表/详情 + `GET /api/squads/:id`；审计 B3/B4/B5  
3. **薄 Inbox** — 合成 feed（不落库），进入 Issue  

**一句话验收：** 用户能从侧栏/命令面板创建并指派 Issue、看到执行进度与连接状态、在 Inbox 跟踪动态、打开小队详情；失败有 toast、未实现入口不装可点。

---

## 1. 范围与架构边界

### 1.1 产品目标

| 目标 | 说明 |
|---|---|
| 可发起工作 | 新建 Issue（标题/优先级/**指派 agent|squad**） |
| 可感知状态 | toast、WS 状态、工作中计数、空态、run 最新 progress |
| 可找到变化 | Inbox 合成最近评论与 run 终态 |
| 差异化可见 | 小队列表 + 协议/roster 详情 |
| 导航诚实 | 未实现模块隐藏或明确未实现，禁止半残 CTA |

### 1.2 三包

| 包 | 交付 |
|---|---|
| **A Chrome** | Toast 体系；EmptyState；NewIssueForm+AssigneeSelect；侧栏新建/搜索→面板；Ctrl+K；WS 芯片；工作中计数；`error.tsx`；侧栏清理 |
| **B 执行/编排** | `run:progress` → 前端展示；`GET /api/squads/:id`；`/squads`、`/squads/[id]`；B4/B5 |
| **C Inbox** | `GET /api/inbox` 合成；`/inbox` 页；侧栏激活 |

### 1.3 不做

| 排除 | 说明 |
|---|---|
| 固化 Playwright 测试目录 / CI e2e | CLI 仅验收 |
| Graphiti / 新记忆后端 | Phase 后续 |
| Projects / Automation / Usage 真功能 | 隐藏入口 |
| 完整 Settings 产品 | 本切片隐藏设置或极简只读（默认隐藏） |
| 落库 inbox_item / 已读未读 | S13+ |
| 独立 NewIssue 模态（除非实现成本更低） | 默认升级内联表单 |

### 1.4 与既有切片关系

- 复用：`AssigneeSelect`、`loadSquadDetail`、`useWsStore`、`RunStatusBar`、Issue 详情  
- 修正：`NewIssueForm` 去掉 `assignee: null` 死策略（D11 过时：BusinessId 已放宽）  
- 并行：S11 `/memory` 若已合 main，侧栏挂 memory；未合则不阻塞 S12  

---

## 2. 决策记录

| 代号 | 决议 | 依据 |
|---|---|---|
| P1 | 厚切片三包全开 | 用户 |
| P2 | 产品向，非答辩专项 | 用户 |
| P3 | Inbox 合成 API 不落库 | 用户 |
| P4 | 新建=内联表单升级+侧栏同能力 | 用户 |
| P5 | Playwright 验收不落仓 | 用户 |
| P6 | 假入口隐藏/标注 | 产品诚实 |
| P7 | progress 仅前端短时状态 | 现 DomainEvent 语义 |
| P8 | SquadDetail HTTP + UI | 审计 B3 + multica |
| P9 | B4/B5 本切片修 | 查缺补漏 |
| P10 | 2 名执行者、工作量加大 | 用户 |

---

## 3. 信息架构

### 3.1 侧栏（S12 后）

| 项 | 行为 |
|---|---|
| Issues | `/` |
| Inbox | `/inbox` **激活** |
| 小队 | `/squads` **激活** |
| 智能体 | `/agents` |
| Wiki | `/wiki` |
| 记忆 | `/memory`（S11 已合则链） |
| 运行时 / Skills | 保留 |
| 我的 issue / 项目 / 自动化 / 用量 / 设置 | **从 NAV 移除或 `hidden`**（默认移除，减少噪音） |
| 搜索按钮 | 打开命令面板 |
| 新建 Issue | 展开看板 NewIssueForm（或路由 `/?new=1` 触发展开） |

### 3.2 路由新增

- `/inbox`  
- `/squads`  
- `/squads/[id]`  

---

## 4. Chrome 设计

### 4.1 Toast

- 引入轻量方案（推荐 `sonner` 或自研 30 行 context）  
- 挂载于 `Providers`  
- 挂钩：`useCreateIssue` / `useUpdateIssue` / `useCreateComment` / `useCancelRun` / 关键 wiki·memory mutation 的 `onSuccess`/`onError`  

### 4.2 NewIssueForm

- 字段：title、priority、**assignee**（复用 `AssigneeSelect` 或内嵌 agent/squad 下拉；创建时带 `CreateIssueInput.assignee`）  
- 成功：toast + 清空；若有指派则依赖现有 PUT/POST 副作用 enqueue  
- 侧栏「新建 Issue」：`router.push('/?new=1')` 或自定义事件/`searchParams`，看板检测后 `setOpen(true)`  

### 4.3 命令面板 Ctrl+K

- 全局 `useEffect` keydown（input 内不抢）  
- 命令：导航到各已实现页；「新建 Issue」  
- 可选：过滤最近 issues（`useIssues` 客户端 filter）  

### 4.4 WS 芯片 + 工作中

- 读 `useWsStore().status` 展示 连接中/已连接/断开  
- 工作中：`issues.filter(i => i.status === 'in_progress' || i.status === 'in_review').length`（简单、无额外 API）  

### 4.5 空态与错误

- 共享 `EmptyState` 用于看板列、Inbox、Squads 列表  
- `app/error.tsx` + issue 详情数据错误友好返回  

---

## 5. 执行进度

### 5.1 前端状态

```typescript
// 例：zustand 或扩展 useWsStore
runProgress: Record<string, string>  // runId → latest text
```

`ws.ts`：`run:progress` 时更新上述 map（可截断 200 字）。

### 5.2 UI

- `RunStatusBar`：active run 为 `running` 时显示 progress 一行（灰字、单行 ellipsis）  
- 不写 DB、不进 React Query 持久 cache  

---

## 6. Squads

### 6.1 API

```http
GET /api/squads/:id
→ SquadDetail | 404
```

实现：`loadSquadDetail(id)`；已有 shared `SquadDetail`。

### 6.2 UI

- `/squads`：列表（name、leader 名若易取）  
- `/squads/[id]`：operatingProtocol、missionDirective、members 列表（只读即可）  
- 链到相关 agent 详情可选  

---

## 7. Inbox 合成 API

### 7.1 契约

```typescript
export const InboxItem = z.object({
  id: z.string(),
  kind: z.enum(['comment', 'run_completed', 'run_failed']),
  createdAt: z.string().datetime(),
  issueId: BusinessId,
  issueIdentifier: z.string().optional(),
  issueTitle: z.string().optional(),
  summary: z.string(),
});
```

### 7.2 算法（server）

1. 取最近 `limit`（默认 50）条 `comment`（order created_at desc）  
2. 取最近 `limit` 条 `agent_run` where status in (`completed`,`failed`)  
3. 批量查 issue 元数据  
4. map 为 InboxItem，merge 按 `createdAt` 降序，截断 limit  

**comment summary：** `{authorLabel}: {body 截断 120}`  
**run summary：** `Run {status} · {runtime}` + 可选 error 截断  

### 7.3 UI

- 列表行：kind 图标/标签 + summary + issue identifier + 相对时间  
- 点击 → `/issues/[id]`  

---

## 8. 审计收口

| ID | 动作 |
|---|---|
| B1 | 前端消费 progress（§5） |
| B3 | GET squad detail + UI（§6） |
| B4 | `ws.ts`：`issue:created` **不要** `setQueryData(['issue', id])` 预填；仅更新列表 |
| B5 | `GET /api/runs` 无 issueId → **400** `{ error: 'issueId required' }` |

---

## 9. 文件触点（预期）

```
shared/src/schema.ts              InboxItem
server/src/routes/roster.ts       GET /api/squads/:id
server/src/routes/inbox.ts        [新] GET /api/inbox
server/src/routes/runs.ts         B5
server/src/app.ts                 register inbox
web/lib/ws.ts                     progress + B4
web/lib/api.ts                    inbox/squad hooks + toast 挂钩
web/lib/toast.ts 或 providers     toast
web/components/NewIssueForm.tsx   assignee
web/components/CommandPalette.tsx [新]
web/components/EmptyState.tsx     [新]
web/components/RunStatusBar.tsx   progress
web/components/Sidebar.tsx        导航诚实 + CTA
web/components/InboxPage.tsx      [新]
web/components/SquadsPage.tsx     [新]
web/components/SquadDetailPage.tsx[新]
web/app/inbox/page.tsx
web/app/squads/page.tsx
web/app/squads/[id]/page.tsx
web/app/error.tsx
```

---

## 10. 执行者切分（少而重）

| 棒 | 范围 | 约当原 2× 工作量 |
|---|---|---|
| **impl-1** | shared InboxItem；B5；Chrome 全套（toast/空态/NewIssue/命令面板/WS/导航/error）；progress 前端；B4 |
| **impl-2** | Squad API+页；Inbox API+页；联调；Playwright CLI 探索验收写入 handoff（路径与结果，**不**提交 e2e 框架） |

契约先行：impl-1 可先合 shared + B5；impl-2 依赖 `GET /api/squads/:id` 与 Inbox 类型（impl-1 末或 impl-2 初落地 Inbox 类型亦可——**建议 impl-1 写 shared InboxItem + B5，impl-2 写 inbox 路由**，避免阻塞 Chrome）。

**修订执行切分（更干净）：**

| 棒 | 范围 |
|---|---|
| **impl-1** | shared `InboxItem`；B4/B5；Chrome 全套；run progress UI |
| **impl-2** | `GET /api/squads/:id` + Squads UI；`GET /api/inbox` + Inbox UI；端到端产品路径验收（含 playwright-cli 手验记录） |

---

## 11. 验收标准

### 11.1 工程
- [ ] `pnpm -r typecheck` 全绿  
- [ ] `pnpm dev` 起 server + web  

### 11.2 Chrome
- [ ] 创建 Issue 可选 agent/squad 指派  
- [ ] 侧栏新建 Issue 可用  
- [ ] Ctrl+K 打开面板并导航  
- [ ] Toast 在失败 mutation 可见  
- [ ] WS 状态可见  
- [ ] 未实现 NAV 项不再假装可点  
- [ ] 空看板列有空态文案  

### 11.3 执行/编排
- [ ] running 时可见 progress 文本（有事件时）  
- [ ] Squads 列表与详情展示 protocol/members  
- [ ] `GET /api/runs` 无 issueId → 400  

### 11.4 Inbox
- [ ] `/inbox` 有合成条目  
- [ ] 点击进入正确 Issue  

### 11.5 验收方式
- [ ] handoff 记录 playwright-cli（或等价）点验路径；**不**要求仓库 e2e 测试代码  

---

## 12. 风险

| 风险 | 缓解 |
|---|---|
| 厚切片失控 | 两棒硬边界；先 API 契约 |
| Inbox 查询重 | limit 50；索引已有 created_at |
| 指派创建双请求 | 优先 POST 带 assignee 一次完成 |
| progress 性能 | 每 runId 只保留最后一条 |
| 与 S11 冲突 | memory 路由独立；侧栏合并时以 main 为准 |

---

## 13. Borrow matrix

| ID | 能力 | 来源 | 落点 |
|---|---|---|---|
| G-PALETTE | Ctrl+K | multica / 原型 | CommandPalette |
| G-INBOX | 注意力 feed | multica inbox | 合成 /api/inbox |
| G-SQUAD-UI | 小队页 | multica / 原型 | /squads |
| G-TOAST | 反馈 | 原型 showToast | Providers |
| G-PROGRESS | 活执行 | hermes stream / 审计 B1 | RunStatusBar |
| G-AUDIT | B3/B4/B5 | 审计报告 | 本切片 |

---

## 14. 自审

| 检查项 | 结果 |
|---|---|
| Placeholder | 无 TBD 功能块 |
| 产品向 | 已去掉答辩绑定 |
| Playwright | 明确不落仓 |
| 与 S11 | memory 可选并存 |
| 审计 | B1/B3/B4/B5 有落点 |
| 厚度 | 两棒、每棒加重 |

### 代码锚点

- `NewIssueForm.tsx` D11 assignee null  
- `ws.ts` run:progress 注释；issue:created 预填  
- `roster.ts` squads 仅 list  
- `loadSquadDetail` 已可复用  
- `Sidebar.tsx` disabled NAV  

---

## 15. 附录：S13+ 产品迭代候选

1. Settings（workspace 路径、MEMORY_PROVIDER 只读说明）  
2. Inbox 已读/落库  
3. 完整「我的 Issue」过滤  
4. Projects / Automation  
5. Graphiti  
6. 可选：将 playwright 冒烟固化为 CI（那时再开切片）  
