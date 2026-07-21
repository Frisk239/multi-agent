# UX Trust A1 — 新建 Issue 绑项目 + cwd 预检

Date: 2026-07-21  
Branch: main  
Plan: `docs/superpowers/plans/2026-07-21-ux-trust-wave-a.md`  
Phase: `app/.progress/phase-multica-ux-trust-2026-07-21.md`

## 本刀范围

看板 **新建 Issue** 可选所属 project；根据 `localPath` / `localPathExists` 展示执行目录预检（隔离 / 项目本机 / 路径无效）；`?project=` 预填；提交带 `projectId`。

## 决策

| 项 | 选择 |
|---|---|
| 数据 | 复用 `CreateIssueInput.projectId` + `Project.localPath(Exists)`，无后端改动 |
| 预检 | 纯前端基于 projects 列表；不冒充服务端 resolve |
| 无效 path | 红条可见，**不**硬拦创建（run 失败由 resolve-run-cwd 负责） |
| URL | `?project=` 预填且保留看板筛选（不 delete） |
| 与 cwd 闸 | 保留原 `showCwdWarn`（`MA_ISSUE_USE_WORKSPACE_CWD` opt-in）并存 |

## 改动

- `app/packages/web/components/NewIssueForm.tsx` — project select、exec banner、submit projectId
- `app/packages/web/app/globals.css` — `.new-issue-exec-banner` is-warn / is-bad / is-ok

## 验收证据

| 项 | 结果 |
|---|---|
| typecheck `@ma/web` | PASS（exit 0） |
| 无项目 → `data-mode=isolated` | PASS ·「将在隔离目录执行…未关联项目」 |
| 有 path 项目 → `project_local` | PASS · `D:\code\multi-agent` |
| 未绑目录项目 → `isolated` | PASS ·「未绑定本机目录」+ 链项目详情 |
| 无效 path → `invalid` | PASS · 探针项目 `A1 invalid path probe` |
| `/?project=<id>` 预填 | PASS · select value + mode=project_local |
| 提交写 projectId | PASS · FRI-51 `A1 UX Trust bind project e2e` → projectId=2c0da958… |

## 不做（本刀）

- run 落库 cwd / UI 展示（**A2**）
- EnvBanner / QC 闸文案（**A3**）
- Chat 绑仓（B1）

## 下一刀

**A2** — Run 落库 cwd mode+path + Runs/Issue 活迹展示。
