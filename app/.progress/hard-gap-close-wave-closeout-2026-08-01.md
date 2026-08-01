# 硬缺口关刀波次 closeout · 2026-08-01

> **分支：** feat/issue-workbench · **来源：** 子代理对照审计（后端 B1-B5 + 前端 F1-F6）→ 用户拍板「一次波次全做」
> **前置：** [gap-close-wave-plan-2026-07-31](./gap-close-wave-plan-2026-07-31.md) 之后的滚动审计（2026-08-01）

## 完成清单（4 commit 全 push）

| 刀 | commit | 内容 | 验收证据 |
|---|---|---|---|
| F1 | `feat: wiki/new 手动沉淀页` | `/wiki/new` 页面（?title/?issueId/?projectId 预填 + Markdown textarea + `useCreateWikiPage` + 成功跳 `/wiki?slug=`）——「完成 Issue → 沉淀 Wiki」闭环唯一断点 404 修复 | 浏览器实测：提交 → 跳转 → 列表出现「验收测试」页并渲染；WikiNewPage 4 测试 |
| F2 | `feat: 建卡 status+labels + 列头快速建卡` | `CreateIssueInput` 加 `status`(default todo) + `labels`；POST /api/issues 前置校验 labels（无效/归档 400 不留半成品）+ 事务写关联 + `issueWithLabels` 回显；createIssueCore position 浮顶落在目标状态列；NewIssueForm 加状态 Select + 标签 chips + `quickCreate` prop；KanbanColumn 列头「+」（data-testid + aria-label 带列名） | 浏览器实测：点「待办」列「+」→ 表单预填待办 → 提交 → FRI-177 `status=todo` + labels=[验收] 落库；issues.contract 4 用例 + NewIssueForm 3 + KanbanColumn 3 |
| F3 | `feat: my-issues scoped 看板` | MyIssuesPage 重写为 KanbanBoard 复用（`scopeFilter` 可选 prop，不改既有 filter 语义）+ 4 scope Tab（全部/已分配/我创建的/我的智能体和小队）+ `?scope=` URL 深链 | 浏览器实测：默认 assigned 选中、切「我创建的」→ URL `?scope=created` + 过滤生效；MyIssuesPage 5 测试 |
| 小修包 | `fix: runtimes 过滤 + CLI token + 死 stub + squad updatedAt` | F4：RuntimesPage 「全部/已安装」按钮接客户端过滤 + aria-pressed + 「添加运行时」入口（→/settings?tab=health）；B2：`cli/ma.ts` `authHeaders()` 统一转发 `MA_LOCAL_TOKEN`（Bearer）+ isMain 守卫；B3：删 `skill/scanner.ts` `getSkillsForAgent` 死 stub；B5：squad 加 `updated_at`（迁移 0047 手写 journal）+ create/PATCH 刷新 + 列表 `updatedAt desc, createdAt 兜底` | 浏览器实测：点「已安装」aria-pressed 切换、表格 4 行过滤；ma.test 4 + roster.squads 20 + schema-migrator drift gate |

**豁免记 ADR：** agent `visibility` / 顶栏 Tab 栏 / squad `creatorId` 三项 → [ADR 0006](../docs/adr/0006-deferred-frontend-scope-waivers.md)（docs commit 随波次）。

## 验收汇总（全部通过）

- **typecheck**：shared / server / web 三包全绿
- **vitest 全量**：shared 97 + server 667 + web 408（含本波次新增：WikiNewPage 4 · MyIssuesPage 5 · RuntimesPage 4 · ma 4 · KanbanColumn 3 · NewIssueForm +3 · issues.contract +4 · roster.squads +排序/updatedAt · schema-migrator +drift gate）
- **浏览器交互验收（Playwright 等效）**：F1 提交→Wiki 渲染；F2 列头「+」→预填→落库（FRI-177 status/labels）；F3 scope Tab→URL 深链→过滤；F4 过滤按钮→aria-pressed→4 行
- **e2e**：`pnpm e2e interactive` PASS（CmdK/快速派活/新建抽屉/侧栏导航）

## 运维注记

- dev.db 陈旧导致 dev server 启动报 `no such column escalated_from_run_id` → `pnpm db:migrate` 应用 pending 后重启正常（运行产物，未 commit）
- 验收产生 dev.db 数据（FRI-177、wiki 验收页）为运行产物，不提交

## Remaining / 下一刀建议

- **B1 Pi runtime 真 backend**（产品面宣称「已安装」但执行必失败；pi.md §5B 有 `pi --mode rpc` 现成协议蓝图）——最值得的下一刀，或至少摘除/标注
- F6 列表页二级 IA（小队「我的/全部」Tab、Skills 更新时间排序、成员头像堆叠）——顺手项
- 主线 reopenable-db-lifecycle D1-D5（独立会话）

## 关刀规范核对

- ✅ 每刀 vitest + typecheck；浏览器交互验收 + e2e-interactive PASS
- ✅ Conventional Commits（feat ×3 / fix ×1 / docs ×1）
- ✅ 未 commit `wiki/` `*.db` 运行产物；migration 手写 journal（idx 47）
