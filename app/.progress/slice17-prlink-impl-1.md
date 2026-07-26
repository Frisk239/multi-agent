# Slice 17 (S5): 关联拉取请求 / PR 状态联动 UI 实现与验证记录

## 1. 概述
- **Slice 名称**: Slice 17 (S5) - 关联拉取请求 / PR 状态联动 UI
- **执行时间**: 2026-07-26
- **完成状态**: ✅ PASS

## 2. 改动汇总

### 2.1 后端 API & Reshape (`packages/server` & `packages/shared`)
- **`packages/server/src/routes/issues.ts`**:
  - 确认 `PUT /api/issues/:id` 支持更新 `prUrl`，允许绑定 HTTP(S) PR URL、Git 分支名，以及传入 `null` 或空字符串进行解绑。
- **`packages/server/src/db/reshape.ts`**:
  - 确认 `toIssue` 转换精准输出 `prUrl: row.prUrl ?? null`。

### 2.2 前端 UI (`packages/web`)
- **`packages/web/components/IssuePrCard.tsx`**:
  - 在 `packages/web/components/IssuePrCard.tsx` 建立精致的【关联拉取请求 (PR)】管理卡片 (`[data-testid="issue-pr-card"]`)。
  - **未绑定状态**:
    - 展示 `+ 绑定 Pull Request / 分支` 按钮 (`[data-testid="issue-pr-bind-btn"]` / `[data-testid="issue-pr-add"]`)。
    - 点击弹出可输入 `prUrl` 的 Modal/Popover 弹窗 (`[data-testid="issue-pr-modal"]`)。
  - **已绑定状态**:
    - 精确解析 GitHub/GitLab PR URL 及本地 Git 分支名，展示 PR Pill 徽章 (`[data-testid="issue-pr-pill"]`)。
    - 呈现状态 Indicator 徽章 (`[data-testid="issue-pr-status-indicator"]`)，支持 `Open` (绿色)、`Merged` (紫色)、`Draft` (灰色) 和 `Linked Branch` (蓝色)。
    - 提供【在 GitHub / Git 打开】按钮 (`[data-testid="issue-pr-open-btn"]` / `[data-testid="issue-pr-link"]`)。
    - 提供【修改】按钮 (`[data-testid="issue-pr-edit-btn"]` / `[data-testid="issue-pr-edit"]`) 与【解绑】按钮 (`[data-testid="issue-pr-unbind-btn"]` / `[data-testid="issue-pr-unbind"]`)。
- **`packages/web/components/IssueDetail.tsx`**:
  - 在右侧属性栏 (`aside.issue-props-rail`) 挂载 `<IssuePrCard issue={issue} />`，与主区域和属性栏融为一体。
- **`packages/web/components/IssueHeader.tsx`**:
  - 移除冗余的默认极简 PR 字段，避免重复渲染。

## 3. 验证结果

### 3.1 TypeScript 类型检查
```bash
pnpm typecheck
# Scope: 3 of 4 workspace projects
# packages/shared typecheck: Done
# packages/server typecheck: Done
# packages/web typecheck: Done
# 0 报错
```

### 3.2 Playwright E2E 自动化测试
运行 `pnpm --filter @ma/web exec node ../../scripts/e2e-slice17-prlink.js` / `node scripts/e2e-slice17-prlink.js`:
- **1️⃣ POST /api/issues**: 成功创建测试卡片。
- **2️⃣ PUT /api/issues/:id (绑定)**: 成功更新 `prUrl` 为 `https://github.com/facebook/react/pull/28000`。
- **3️⃣ PUT /api/issues/:id (解绑)**: 传入 `null` 成功恢复 `prUrl` 为 `null`。
- **4️⃣ Web UI Playwright 交互测试**:
  - 验证 `[data-testid="issue-pr-card"]` 渲染及未绑定入口展示。
  - 点击 `+ 绑定 Pull Request / 分支` 弹窗 `[data-testid="issue-pr-modal"]` 正常。
  - 绑定 `https://github.com/owner/my-repo/pull/88` 成功，PR Pill 徽章显示 `#88` 与 `owner/my-repo`，Status Indicator 显示 `Open`。
  - 修改为 Git 分支名 `feat/slice17-prlink-ui` 成功，Pill 显示分支名与 `Linked Branch` 状态。
  - 点击【解绑】按钮成功恢复到未绑定 `+ 绑定 Pull Request / 分支` 入口。
- **最终测试结论**: `🎉 Slice 17 (S5) E2E 验证全部成功通过！`
