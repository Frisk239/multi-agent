# Slice 5: Issue 自定义字段 (Custom Fields) 关刀记录

**日期:** 2026-07-26  
**Slice Owner:** Antigravity  
**验收状态:** ✅ 通过 (`pnpm typecheck` 0 报错 + Playwright E2E 验证全量 PASS + `git push origin main` 成功)

---

## 落地内容与用户路径

### 1. 核心改进 (Issue 自定义字段)
- **后端 Schema 与 API (`packages/server` & `@ma/shared`)**:
  - 在 `issues` 表中添加 `custom_fields` 列。
  - 修改 `reshape.ts` 确保响应映射 `customFields`。
  - 更新 `POST /api/issues` 和 `PUT /api/issues/:id` 支持接收、解析与更新 `customFields`，更新时记录 `activity_log`。
- **前端 UI 组件与集成 (`packages/web`)**:
  - 创建组件 `IssueCustomFields.tsx`，支持卡片式展示键值对、动态添加新 Key-Value 与实时删除。
  - 在 `IssueHeader.tsx` 属性栏添加“自定义字段”配置块。
  - 在 `NewIssueForm.tsx` 增加可选自定义字段拓展填写区。

---

## 验证结论

1. **TypeScript 校验**: `pnpm typecheck` **0 Error** (packages/shared, packages/web, packages/server 全部 pass)。
2. **Playwright 端到端 (E2E) 验证**: 运行 `scripts/e2e-slice5-customfields.js` 验证自定义字段 API 提交与前端组件全量 PASS。
3. **Commit & Remote Push**: 已推送到 `main` 分支。
