# 执行者 Kickoff · G8-1 看板 waiting_local_directory 活性闭环

把下面「启动提示词」整段复制给实现用 AI / 执行者会话。

---

## 启动提示词（复制从下一行开始）

```
你是本仓实现执行者（非计划者）。工作区：D:\code\multi-agent（或当前 clone 根）。

## 角色与铁律
- 只实现本刀 Must；不做「顺手重构」。
- 遵守 AGENTS.md：纯本地、不自造 agent loop、不改 references/repos/、密钥不落库。
- 标识符英文；UI 文案中文。
- 改完跑相关测试；回传「改了啥 / 怎么验 / 风险」——不要自称刀已验收完成（计划者验收）。

## 本刀：G8-1 · 看板 waiting_local_directory 活性闭环
规格：`.scratch/g8-trust-execution/spec.md` §G8-1

### 背景
后端已有 `waiting_local_directory` 状态与 WS 事件；看板 live 脉冲只拉 `running`/`queued`，路径锁等待时卡片无呼吸灯，用户以为没派上。

### Must
1. 在 `app/packages/web/components/KanbanBoard.tsx`（及相关 hook）增加对 `waiting_local_directory` 的 runs 拉取，并入 `activeIssueIds`（或等价「活跃」集合）。
2. 卡面/列表现：waiting 状态可感知（chip 或沿用 run-active 脉冲 + 可区分文案「等目录」类，与现有 design system 一致）。
3. 不破坏现有 running/queued 活性、Sheet 打开、筛选 URL。
4. 若 `useWorkspaceRuns` 已支持 status 过滤则复用；WS 投影已存在则只补数据源与 UI，勿重造协议。

### Out of scope
- Git worktree 并行、改 path-lock / 串行语义
- 后端状态机改动（除非发现 API 根本不返回 waiting 且有明确 bug——先停报计划者）
- CmdK 新命令非必须（可选加分：「等待本机目录」筛选）

### 建议触摸
- `KanbanBoard.tsx`（约 172–175、528 行附近 activeIssueIds）
- `IssueCard` / 列组件若需 chip
- `lib/api/runs.ts` 或既有 hooks（若缺 status 类型）
- 相关 `*.test.tsx` 或补最小单测

### 验收（你自测后写进回报）
- [ ] 构造/模拟同 project 下一 run running、另一 waiting → 第二张卡有活性或「等目录」标识
- [ ] running/queued 脉冲不回归
- [ ] web 相关 test + typecheck 绿（或说明未跑原因）
- [ ] 无整页强制刷新才看到 waiting

### 回报格式
1. 改动文件列表
2. 关键逻辑 3–8 行说明
3. 自测命令与结果
4. 计划者需人工点的路径（若有）
5. 未做/发现的债

完成后停，等计划者验收。不要 push，除非 brief 明确要求（本刀默认：实现 + 本地测，commit 可由计划者或后续会话统一）。
```

---

## 计划者验收清单（G8-1）

- [ ] `activeIssueIds`（或等价）包含 waiting  
- [ ] UI 可区分/至少可见 waiting 活性  
- [ ] 无 path-lock 语义回退  
- [ ] 测试/typecheck 证据  
