# Wave A Playwright 端到端验收

Date: 2026-07-21  
Scope: A1 + A2 + A3（UX Trust）

## 结果总览：**PASS**

| 用例 | 结果 | 证据摘要 |
|---|---|---|
| A1.1 无项目 → 隔离预检 | PASS | `data-mode=isolated` · 文案含「隔离」· project options≥3 |
| A1.2 有 path 项目 → 本机 | PASS | `data-mode=project_local` · path 含 multi-agent |
| A1.3 无效 path → 红条 | PASS | `data-mode=invalid` · 文案含「无效」 |
| A1.4 未绑目录 → 隔离 | PASS | `data-mode=isolated` ·「未绑定」 |
| A1.5 提交带 projectId | PASS | form 关闭 · API projectId=2c0da958… · title=E2E WaveA bind project |
| A1.6 `?project=` 预填 | PASS | select value 正确 · mode=project_local |
| A2.1 Run 详情 cwd | PASS | `run-cwd` · mode=project_local · 项目本机 + path |
| A2.2 Runs 列表 cwd | PASS | `runs-row-cwd` ·「项目本机」 |
| A3.1 Settings 隔离文案 | PASS | 含 MA_ISSUE_USE_WORKSPACE_CWD +「隔离」· 无阻塞 badge |
| A3.2 EnvBanner 不误拦 | PASS | cwd ok 时无 cwd 硬拦顶栏 |
| A3.3 Settings API | PASS | cwd.status=ok · detail 含隔离/project 语义 |

## 环境

- web `:3000` · API `:3001`
- 探针项目：`F1 path test 152451`（valid）、`A1 invalid path probe`（invalid）

## 结论

Wave A 可宣称端到端诚实路径可用 → 进入 **B1 Chat 绑 Project**。
