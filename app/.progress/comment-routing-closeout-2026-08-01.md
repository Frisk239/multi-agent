# B1/B2 评论触发路由 · 关刀 closeout（2026-08-01）

> 分支 `feat/issue-workbench` · commit `740f644`（前序 W1 附件接线 `0bb8ffc` + 计划文档 `03d335f`）
> 来源：子代理对照审计（`comment.go:1027/1105/1897`）→ Owner 拍板 → 实现子代理 → Owner 复验

## 改了什么

**`server/src/orchestration/comment-trigger.ts`**（唯一实现改动）
- `triggerFromComment` 补齐 fallback 链，对齐 multica `computeCommentAgentTriggers` 优先级：
  1. 有 agent/squad mention → **只按 mention 走**（assignee/thread-parent 不叠加，防双触发）
  2. agent 作者评论默认不参与路由；唯一窄路径：squad-assigned issue 上 agent 评论 → 唤醒被指派 squad 的 leader（保 leader→worker→leader 闭环；self-trigger guard：作者=leader 跳过；去重/熔断跳过时静默，不产噪音 note）
  3. member 回复 agent 评论 → 触发父评论作者（thread-parent；父作者不存在/已归档 → 落 assignee）
  4. 否则（无 parent / parent 非 agent / 未指派）→ routeAssigneeFallback（issue_assignee：agent → enqueueAgentRun；squad → 解析 leader 后 enqueueLeaderRun；member/未指派 → 空）
- `MentionDispatch` 加可选 `source: 'mention' | 'assignee' | 'thread-parent'`（向后兼容）；`publishDispatchSummary` 系统总结标题按 source 区分（「@提及派发 / 将任务派给指派人 / 回复将唤醒」）；`mention_delegated` activity payload 带 source
- 乒乓防护：不新增机制，复用 `run-service.ts` checkAndEnqueue 的 per-(issue,agent) 去重 + 15 次熔断；agent 作者默认不触发即主力防护

## 怎么验的（Owner 复验，非转述）

| 项 | 结果 |
|---|---|
| `pnpm -r typecheck`（shared/server/web） | 全绿 |
| server vitest 全量（72 文件 / 555 用例） | 全绿（新增 comment-trigger.test.ts **19 用例**：B1×5 / B2×5 / agent 作者×4 / 防叠加×1 / mention 回归×3 + payload 断言） |
| `e2e-comment-routing.mts`（新，独立 DB `e2e-b1b2.db` 起服） | **6/6 PASS**：B1 agent 指派 → runId 落地 · B1 squad → leader run · 未指派空 · mention 不叠加 · B2 回复唤醒父作者（不叠加 issue assignee）· 系统总结 comment 可见且标题按 source 区分 |
| 清理 | e2e DB 已删；server 后台任务已停 |

## 残留 / Remaining

- **B3** escalation fallback（assignee 作父作者触发失败后的延迟升级）与 fire_at 惰性任务 —— 刻意不做（CONTEXT.md:68 边界）
- **thread root owners** 多级回复路由 —— 本仓 S3 仅一层回复，未做（multica 有）
- 前端零改动：`CommentComposer` liveTriggers 只消费 body 内 mention，B1 派发走 POST 响应的 `dispatches`（server 私有类型），展示层兼容已由 web typecheck 证

## 下一刀建议

- **B4** 运行时发现登录 shell fallback（nvm/fnm CLI 探测不到，`detect-path.ts:17-70`）——P2，可并入 W4/W5 相关刀
- **W2 乐观更新扩面 / W3 表单校验 + a11y** —— 7/31 波次计划里日用痛感最高且未开的刀
- W1 附件接线已随本会话 `0bb8ffc` 落库，可在 web 端走查验收（拖 >512 KiB png 进评论框）
