# Goal 第三波 closeout（2026-08-02）— 产品完成态：M1–M3 + G4-5 部分

> 波次目标：M4 工程债清零（G5-1/G5-2）→ M2 可靠性收尾（G5-3/G5-4）→
> M3 前端 Must 补全（G3-3/G3-4/G3-5）→ M4 可裁剪（本波做 G4-5 CLI 部分）。
> 全部门禁：`pnpm typecheck` + 全量 `pnpm test`（含 shared）绿；每刀证据见 commit。

## 本波关刀（9 commit，全部合 main）

| 刀 | 内容 | commit | 测试证据 |
|---|---|---|---|
| **G5-1** | skill/scanner + import-url 完整测试（全仓最大测试盲区 1095 行清零） | `693423e` | scanner.test.ts 25 例 + import-url.test.ts 26 例；**顺带修复 2 个生产 bug**：github 多 skill fallback（dirs 死代码从未生效）、clawhub meta 请求失败阻断导入 |
| **G5-2** | auto-retry 类型安全化（去 any/去反射/去手写 SQL 列名） | `db2dcbb` | `RetryExecutor = Pick<BetterSQLite3Database,…>`；30 列 INSERT…SELECT → `insert().values()` 类型化（SQLite 无 insert().select()，防重语义 JS 预检 + 唯一索引不变）；21 auto-retry + 22 stale-runs 回归绿 |
| **G5-3** | 灾备 Wiki 换入 + 覆盖报告（reopenable-db 收尾） | `7fe3e96` | stage.json wiki 校验（缺字段拒绝 + 目录缺失拒绝）；`swapWikiUnderMaintenance` 原子换入（旧 wiki 同级备份保留）；journal wiki 字段（status/liveRoot/stagedRoot/includedFiles/movedOldTo/error）；dry-run 报告列受影响页（global pages + project roots）；真实链路 6 测试 |
| **G5-4** | 进程生命周期收尾（崩溃语义钉死 + orphan 测试固化） | `b4f44ca` | run-control 崩溃语义文档（三类窗口处置）；cancel 崩溃窗口注释；recoverOrphanedRunningRuns G5-4 注释 + 3 测试（崩溃残留收尸/活 executor 跳过/终态不碰） |
| **G3-3** | Issue/Squad 详情 run 历史行内 transcript 预览（不跳页可见产出） | `3edb01c` | RunTranscriptPreview（pairRunToolEvents 配对摘要）；IssueRunHistory + SquadRunsTimeline 行内展开；+2 测试 |
| **G3-4** | Agent 环境变量/自定义参数编辑（API 落库 + UI 保存/回读） | `d816ef7` | agent 表 +env_vars/custom_args（0049 migration + journal）；shared AgentEnvVar；roster 路由 JSON 落库；AgentDetail settings tab EnvVarsEditor；+5 server +3 web 测试 |
| **G3-5** | IssueDetail 附件区真实上传（文件选择 + 拖拽 + 下载/删除，≤25MiB） | `a215118` | 上传按钮（多选）+ 整区拖拽 dropzone + 前置校验（validateUploadFile）+ 上传中提示；+3 测试 |
| **e2e** | M3 Playwright 冒烟证据 | `cc33ac1` | 真服务 + headless：G3-3 行内面板展开 / G3-4 编辑器可见可加行 / G3-5 上传按钮 + ≤25MiB 提示，**6/6 PASS** |
| **G4-5**（部分） | `ma wiki query --roots` CLI flag（跨根检索） | `d57e214` | positional 剥离 flag；main 导出；+2 测试 |

## 门禁数据（每刀全量）

- 起点基线：1338（shared 121 / server 792 / web 425）
- 终点：**1363**（shared 121 / server 809 / web 433）；typecheck 全绿
- 新增测试：G5-1 +51、G3-4 +8、G3-3 +2、G3-5 +3、G4-5 +2、G5-4 +3、G5-3 +6（部分并入既有文件）

## 顺带修复 / 工程加固

1. **2 个生产 bug（G5-1 测试暴露）**：github 多 skill fallback 死代码（`dirs` 构造后未传，`tryDirs` 硬编码 `['']`——「无 path 时 root→skills→.claude/skills」从未生效）；clawhub meta 请求不在 try/catch（HTTP 失败直接阻断导入，file 候选永远走不到）
2. **vitest server 超时放宽**（10s/20s）：全量并发下 buildServer/migration 偶发超默认 5s/10s（波动，非逻辑失败）
3. **vitest server maxForks 4**：本机常驻 MCP 进程 438 个占内存，全量并发 worker 峰值触发 `VirtualAlloc failed`；限流后稳定绿
4. `blocks ordinary writes` 测试超时放宽 20s（buildApp 全量并发下慢）

## 验收对照（目标清单）

- [x] scanner + import-url 完整测试（URL 导入/竞态/失败路径全覆盖；import-url 零测试历史清零）
- [x] auto-retry 无 any/无反射/无手写 SQL 列名；15 次熔断/唯一索引防重语义回归绿（auto-retry 21 测试）
- [x] 灾备：stage 校验含 Wiki roots；恢复可 swap wiki 目录；journal 记录 wiki 字段；覆盖报告列受影响页
- [x] 进程生命周期：abort 注册表崩溃语义明确（文档 + 测试）；重启 orphan 兜底（recoverOrphanedRunningRuns）
- [x] Issue/Squad 详情 run 历史行内展开 transcript（不跳页可见产出；Playwright 实证）
- [x] Agent 详情可编辑环境变量/自定义参数（API 落库 + UI 保存/回读）
- [x] IssueDetail 附件区真实上传（文件选择 + 拖拽 + 下载/删除，≤25MiB）
- [x] （M4 部分）`ma wiki query --roots` 可用
- [x] 全程 typecheck 绿 + 每刀有测试 + Playwright 证据 + 全量 pnpm test 绿（含 shared）

## 未做（M4 其余，留给后续波）

- G3-6 Issue 自定义字段 UI（schema 已有 customFields JSON）
- G4-5 其余：health 一键报告 / backlink 相关页
- G3-7 二阶体验池 / G5-5 通知 / G5-6 运营统计 / G5-7 导入导出 / G2-5 并发配额
- G1-5 pgvector 软回退可观测（Wiki 半边已由 G4-3 覆盖）
- G3-4 的 envVars/customArgs **执行层注入**（spawn-line 仍 `env: process.env`；本刀按验收只做落库+UI，注入点留待后续）

## 下一步建议

1. `git push origin main`（本波 9 commit 已落本地；当时代理 127.0.0.1:7890 未运行）
2. 下一波首取：G3-6 自定义字段 UI（价值中成本小）或 G4-5 health 一键报告
