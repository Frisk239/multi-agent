# S02 impl-3 启动提示词（复制下方代码块整段到新会话）

> 使用时机：`s02-impl-2.md` 已写完，且计划者验收通过（或用户明确说可开 impl-3）。  
> 仓库路径：`D:\code\multi-agent`  
> 分支：在 **`feat/s02-issue-detail`** 上继续

---

```markdown
你是 S02 的 **impl-3 执行者**（不是计划者）。只做 **web 详情页 + 时间线 + 发评论/@ 补全 + D12 + WS 扩展 + 浏览器验收**。不要大改 server（除非联调发现明显 bug 的最小修复，并记偏离）。

## 仓库
- 路径：`D:\code\multi-agent`
- 工程模式：`AGENTS.md`；handoff：`app/.progress/`

## 开工前检查
```bash
cd D:/code/multi-agent
git checkout feat/s02-issue-detail
git pull
git log --oneline -12
```
确认：
- 分支 `feat/s02-issue-detail`
- 已有 impl-1 + impl-2 commits
- 已读 `app/.progress/s02-impl-2.md`（给 impl-3 的注意点）

若 impl-2 未完成：**停下来告诉用户**。

## 必读（按顺序）
1. `AGENTS.md`
2. `app/.progress/s02-impl-2.md`  ← 上一段交接（最重要）
3. `app/.progress/s02-impl-1.md`  ← 契约/seed 背景
4. `docs/superpowers/specs/2026-07-09-s02-issue-detail-design.md` **§7、§9、§6.2**
5. `docs/superpowers/plans/2026-07-09-s02-issue-detail.md`：
   - Global Constraints
   - **执行者片段 C（impl-3）Task 3.1 → 3.3**（含完整代码）

## 本会话范围（只做这些）
| Task | 内容 |
|------|------|
| 3.1 | `react-markdown` · `lib/api.ts` hooks + **D12** · `lib/ws.ts` 处理 comment:created |
| 3.2 | `/issues/[id]` · IssueHeader/Timeline/MarkdownBody/Composer · IssueCard Link · globals.css |
| 3.3 | `pnpm dev` 浏览器按 spec §9 验收 · 写 `app/.progress/s02-impl-3.md` |

## 硬约束
1. **D12 / R2：** `useUpdateIssue` 乐观更新 **只改 Issue**（`['issues']` + `['issue', id]`）；**禁止**乐观插入 status_change / comment 行
2. **R9：** POST comment 不做乐观插入；用 201 body + WS id 幂等
3. **R10：** issue.description **纯文本**（pre-wrap），不跑 react-markdown
4. **R1：** mention 支持 `mention://agent/...` 与 `mention://squad/...` → `.mention-pill`
5. **R4：** 状态 select 为 IssueStatus **七态全量**（含 cancelled/blocked）
6. **R5：** 优先级 / 指派 **只读展示**，无编辑
7. 卡片：标题 `Link` 进详情 + `draggable={false}` / `stopPropagation`，降低与拖拽冲突
8. 只在 `feat/s02-issue-detail` 提交
9. 不动 `chanpin/prototype/`、`references/repos/`
10. Next.js `params`：先查 next 版本；15 可能是 `Promise<{id}>`，计划里有探测说明

## 明确不做
- mention 触发 agent 入队（S04）
- 改 assignee API/UI
- 收件箱三栏
- 评论编辑/删除
- 不要重做 monorepo / comment 表（那是 impl-1/2）

## 联调准备
```bash
cd D:/code/multi-agent/app
# 如需干净库：
# Remove-Item packages/server/dev.db*
# pnpm --filter @ma/server db:migrate
# pnpm --filter @ma/server db:seed
pnpm dev
```
- web http://localhost:3000
- server http://localhost:3001 · WS `ws://localhost:3001/ws`

## 验收清单（spec §9，handoff 逐项勾）
### 工程
- [ ] `pnpm -r typecheck` 三包绿
- [ ] `pnpm dev` 双端口

### 功能
- [ ] 看板点 FRI-11 标题 → `/issues/<uuid>`，顶栏 FRI-11
- [ ] 描述 + 指派「产品小队」只读
- [ ] 时间线 ≥3 seed；队长条 MD 标题 + mention pill
- [ ] 发评论 → 作者「林远」
- [ ] 详情改状态 → 顶栏变 + timeline status_change
- [ ] 看板拖拽改状态 → 进详情可见 status_change
- [ ] `@` 补全能选 agent 与 squad，pill 正确
- [ ] 看板新建/拖拽回归可用

### 实时
- [ ] 双窗口同详情：A 发评论 → B 出现
- [ ] 双窗口：A 改状态 → B 顶栏 + 时间线
- [ ] HTTP+WS 同 id 不重复两条

## 完成定义（DoD）
1. §9 核心项通过（至少功能 + 工程；实时尽量做）
2. 已写并提交 `app/.progress/s02-impl-3.md`
3. handoff 含：typecheck 输出、§9 勾选、偏离、给计划者/合并的注意点
4. 停下来回报；**不要**自己合 main / 开 PR（除非用户要求）

## 工作方式
严格按计划 Task 3.1→3.3。做完即停，等计划者切片验收。
```

---

## 执行者应交 handoff 骨架 → `s02-impl-3.md`

```markdown
# Handoff: S02-impl-3

> 切片：S02 · 角色：impl · 序号：3
> 日期：YYYY-MM-DD
> 分支：feat/s02-issue-detail

## 上下文
S02 第三执行者：web 详情 + 时间线 + Composer/@ + D12 + WS + §9 验收。
前置：s02-impl-2.md。

## 本会话完成了什么
- [ ] api hooks + D12
- [ ] ws comment:created
- [ ] /issues/[id] 与组件
- [ ] IssueCard 入口
- [ ] §9 浏览器验收

## 自测结果
```
$ pnpm -r typecheck
（贴输出）
```
§9 勾选表：（复制上表结果）

## 与计划的偏离
- 无 / …

## 遗留 / 给计划者的注意点
- 已知 UI 瑕疵
- D11/D12 是否真正关闭
- 是否可开 PR

## 验收结论（计划者填）
- [ ] typecheck
- [ ] §9 功能
- [ ] §9 实时
- [ ] 可合并 main
- 结论：
```
