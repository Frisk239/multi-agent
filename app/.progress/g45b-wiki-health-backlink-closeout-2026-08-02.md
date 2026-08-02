# G4-5b Wiki health 一键报告 + backlink —— closeout（2026-08-02 第四波 M3）

**刀名：** G4-5b Wiki health 一键报告（结构检查聚合一键跑 + 结果页）+ backlink（引用自其他页）
**Goal：** G4（知识/记忆）/ 目标 M3 知识纵深

## 勘察结论（半截确认，防重复实现）

- **health 一键报告已闭环**（第三波 G4-5 CLI 部分 + 更早 S07）：`wiki/health.ts checkHealth`（孤儿/断链/空短/矛盾，零 LLM）+ `GET /api/wiki/health` + 前端 WikiHealthPanel（进入 Wiki 自动跑 + 手动「重新结构检查」按钮 + 结果表 + 跳转/分享 + `wiki-health-badge` 计数）。**无需新增**。
- **backlink 缺**：无「引用自其他页」反查（health.ts 有入链计数但未暴露单页反查；前端无展示区）。

## 改动清单

| 文件 | 改动 |
|---|---|
| `server/wiki/backlinks.ts`（新） | `listBacklinks(slug, opts)`：扫所选根全部页，`[title](slug.md)` 内链正则反查；一页只计一次；自引用不计 |
| `server/routes/wiki.ts` | `GET /api/wiki/pages/:slug` 响应扩展 `backlinks: [{from, title}]`（向后兼容，缺省空数组） |
| `shared/schema.ts` | `WikiPage.backlinks?`（optional，兼容旧消费方） |
| `web/components/WikiPage.tsx` | 详情区加「引用自其他页」区（data-testid=wiki-backlinks / wiki-backlink-item；空态提示孤儿候选 + 引导结构检查；点击 from 页可跳转） |

## 测试与实证

- `server/wiki/backlinks.test.ts`（新，2 用例，真临时 wiki 目录）：重复链接一页只计一次；自引用不计；断链目标（不存在页）照常反查；无引用页返回空。
- `pnpm typecheck` 全绿（shared/web/server）。
- **实证（验收标准：health 一键报告可跑 + backlink 页面上可见）**：
  - `GET /api/wiki/health`：真实库 total=8 · orphans=8 · broken=0 · stubs=2 · contradictions=0（结构检查一键跑）；
  - backlink：临时页 `[FRI-47 巡检](FRI-47-巡检-2026-07-19.md)` → `GET /api/wiki/pages/FRI-47…` 返回 `backlinks=[('g45b-empirical','Backlink 实证页')]`；删除临时页后反查清空（链路真实生效）；
  - UI：WikiPage 详情渲染 backlinks 区（Playwright 关刀统一验证）。

## 下一刀建议

M4 体验收尾（可裁剪）：G3-7 取 2 项（CmdK polish / 失败恢复 CTA）+ G5-7 JSON 导入导出，或视剩余余力收 G2-5/G1-5。随后最终验收（全量门禁 + Playwright + 回写 roadmap/CONTEXT + push）。
