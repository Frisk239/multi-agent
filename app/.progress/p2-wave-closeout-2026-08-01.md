# P2 波次 · 关刀 closeout（2026-08-01）

> 分支 `feat/issue-workbench` · 计划 [p2-wave-plan-2026-08-01](./p2-wave-plan-2026-08-01.md) · 来源：对照审计报告 P2 项（B2 已随 comment-routing `740f644` 合入，未入本波次）

## 波次完成情况

| 刀 | commit | 验收证据 | 状态 |
|---|---|---|---|
| **P2-1** F1 快捷键设置页 | `69b97b1` | SettingsPage.test.tsx 2 例（nav 条目渲染 + openHelp 调用不切 tab）+ typecheck | ✅ |
| **P2-2** B4 登录 shell fallback | `68b6c66` | detect-path.test.ts **15 例**（env 优先回归 / which 命中 / 登录 shell 命中 / 空输出 / 非绝对路径 / 超时 / $SHELL 缺失与白名单 / 不安全名 / 多候选 / win32 MSYS 转换与补探）+ **真机 Git Bash `-ilc` E2E**（仅登录 profile PATH 的候选被兜底发现） | ✅ |
| **P2-3** B5 Wiki 跨项目索引 | `744c593` | query.test.ts **5 例**（单根回归 / 跨根命中 / slug 冲突 cite 归属 / 无 key 降级×2）| ✅ |
| **P2-4** B3 fire_at 惰性任务 | — | **挂起**：默认不自动开（宪法 CONTEXT.md:68「Deferred 默认强制改派」禁区；只做惰性半截价值打折，要开需人解禁） | ⏸ |

**波次终验：** server vitest 74 文件 / **575 用例全绿**；`pnpm -r typecheck` 三包全绿。

## 关键实现摘要

- **P2-1**：Settings 左栏「我的账号」组加「快捷键」nav 条目 → `useShortcuts().openHelp()`（弹层全局挂 layout，`?` 同款），不切 tab、不建第二套弹层。
- **P2-2**：`resolveCmd` 探测链加第三步 —— `$SHELL -ilc` 单次探测（multica `resolveAgentsViaLoginShell` 语义移植）：POSIX shell 白名单、`SAFE_CMD_NAME`、`unalias/unset -f` 破 Git Bash 别名遮蔽（实测 `alias node='winpty node.exe'` 必废兜底）、`cd+pwd -P` 折叠 fnm/nvm multishell、8000ms 超时、失败静默；win32 下 MSYS `/c/...`→`C:/...` 转换 + `.exe/.cmd` 补探（npm shim）。
- **P2-3**：`queryWiki` 显式 `roots:'all'` 跨根（global + 有效 project 根），默认单根行为不变；候选/引用带根 label（slug 跨根冲突可区分）；**顺带修复**：无 `WIKI_LLM_API_KEY` 时 query 原会硬 500，新增关键词直出降级（只吞该错误）。

## Remaining / 后续

- **P2-4 待决**：若人解禁「自动改派」禁区或接受「只做 fire_at 惰性半截」，再开刀（计划已备 Must/Out/文件面）
- Wiki 跨根 **UI 开关**（WikiQueryDialog）+ CLI `ma wiki query --roots`：非一行透传，未做（P2-3 Out 范围）
- P2-3 顺带降级若需回退：删 `query.ts` Step 2/4 的两个 catch（closeout 已记，回退成本低）

## 关刀规范核对

- ✅ 每刀 vitest + typecheck 全绿；e2e：P2-2 真机实测（登录 shell 路径），P2-1/P2-3 组件/管线单测覆盖
- ✅ Conventional Commits（feat: ×3）
- ✅ 未 commit `wiki/` `*.db` 运行产物
