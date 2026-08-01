# F6 数据面收尾 closeout · 2026-08-01

> **分支：** feat/issue-workbench · **Intake：** [pi-backend-f6-closeout-2026-08-01](./pi-backend-f6-closeout-2026-08-01.md) Remaining 第 2 项（F6 数据面欠账）
> **选刀依据：** pi CLI 未装（真机验收不可行）→ 补上一刀两处降级，垂直可演示

## 完成清单（1 commit 已 push）

| 项 | 内容 | 验收证据 |
|---|---|---|
| 后端数据面 | `GET /api/squads` 下发 `memberIds`（一次查全表按 squadId 分组，顺带消除原逐行 N+1 COUNT）；`GET /api/skills` 下发 `updatedAt`（skill 文件 mtime ISO；无路径/读不到 → null） | curl 实测：sqd-product → `memberIds:[agt-research,agt-prd,agt-proto]`；skills 全带 `updatedAt` ISO；roster.squads 21 + skills.test 2 + scanner.builtin 3 绿 |
| shared | `SquadSummary.memberIds` + `SkillInfo.updatedAt`（zod 可选） | schema.test 46 绿 |
| 前端点亮 | SquadsPage `SquadMemberCell` 成员首字头像堆叠（FNV-1a 31 倍 hash 8 色板、最多 4+N 溢出、title 全名、反查不到降级「N 名成员」）；「我的」Tab 加 memberIds 成员维度；SkillsPage 排序真实 `updatedAt desc`（null 排尾，全缺 name 兜底） | 浏览器实测：小队 3/1/2 头像堆叠 + hash 色（同行同成员色一致）；`/skills?sort=updated` DOM 顺序 = expected desc（ma-* 8/1 排最前）；SquadsPage 18 + SkillsPage 7 绿 |

**测试全量：** shared 103 + server 677 + web 423 全绿 · `app/` 三包 typecheck 绿（子代理跑，Owner 复核浏览器路径）。

## 诚实说明

- 「我的」Tab 的 memberIds 分支是逻辑正确性：本地单用户 `user-linyuan` 不是 agent，server `assertAgentExists` 不允许非 agent 进 squad_member，实际仍走 leaderId 分支（0 条）——语义完整留给将来 server 放开成员类型时自动点亮
- 头像 hash 色为内联 8 色板（无既有色板可复用）；碰撞可能但视觉可接受
- updatedAt 走路由层逐条 statSync（~10 skill 可接受，未动 scanner 索引）

## Remaining / 下一刀建议

- **B1 真机验收**：装 `pi` 后派一条 issue e2e（协议 mock 已全绿，真机验证最后一环）
- **主线 reopenable-db-lifecycle D1-D5**（拆解就绪，独立会话）
- 可选：`listRuntimeModels` 加 pi 模型端点

## 关刀规范核对

- ✅ vitest + typecheck（app/ 三包）；浏览器交互验收（squads 头像 / skills 排序 / API 字段）
- ✅ Conventional Commits（feat ×1）
- ✅ 未 commit `wiki/` `*.db` 运行产物；未碰 references/repos/
