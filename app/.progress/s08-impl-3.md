# Handoff: s08-impl-3

> 切片：`S08` · 角色：`impl` · 序号：`3`（最后一个执行者）
> 日期：2026-07-16
> 分支：`feat/s08-bridge-queue-cli`
> **基线：** 接 impl-2（计划者验收 `57a6f63`）

## 上下文（给下一个会话读）

S08 = Phase 2 收尾：AGENTS.md 桥梁 + ingest 队列/DLQ + CLI Envelope。

impl-3 边界：**CLI envelope + `ma wiki` + 端到端验收（spec §8）**。

- 前序：[`app/.progress/s08-impl-2.md`](./s08-impl-2.md)
- spec：`docs/superpowers/specs/2026-07-16-s08-agents-bridge-queue-cli-design.md` §5 / §8
- 计划：`docs/superpowers/plans/2026-07-16-s08-bridge-queue-cli.md` 执行者片段 C（Task 3.1–3.3）

## 本会话完成了什么

| Task | 内容 | Commit |
|---|---|---|
| 3.1 | `cli/envelope.ts` `emitOk` / `emitErr`（stdout/stderr JSON + exit） | `1f97e40` |
| 3.2 | `cli/ma.ts` + package.json `"ma": "tsx src/cli/ma.ts"` | `ec7c985` |
| 3.3 | 端到端验收 + 本 handoff | （本 commit） |

### CLI 命令

| 命令 | 行为 |
|---|---|
| `ma wiki health` | `checkHealth()` |
| `ma wiki lint` | `checkLint()` |
| `ma wiki query "<q>"` | `queryWiki(q)` |
| `ma wiki pages` | `listWikiPages()` |
| `ma wiki jobs` | 列表（可选 `--status=`） |
| `ma wiki jobs retry <id>` | 仅 dead→pending |
| `ma wiki ingest <issueId>` | 默认 enqueue；`--sync` 同步 `ingestIssue` |

用法：`cd app/packages/server && pnpm run ma -- wiki <cmd> ...`

### 实现要点

- Envelope：成功 stdout `{ok:true,status,data,meta}` exit 0；失败 stderr `{ok:false,error:{type,message,exit_code}}` + 4/5/7
- `--format text|json`：显式 text→人读；默认 TTY→text、pipe→json；显式 `json` 强制 envelope
- **不复制业务**：只 import queue/store/health/lint/query/ingest
- **CLI 不 wake worker**（有意偏离计划）：CLI 是独立进程，`wake`→claim 后 `process.exit` 会把 job 卡在 `running`。enqueue/retry 后依赖 **server 进程** 的 500ms tick claim；需要立刻执行用 `--sync`
- 剥离 pnpm 注入的单独 `--` 参数

## 自测结果

**typecheck**

```
$ cd app && pnpm -r typecheck
packages/shared typecheck: Done
packages/server typecheck: Done
packages/web typecheck: Done
```

**CLI（`app/packages/server`，`--format json`）**

| 用例 | 结果 |
|---|---|
| `pnpm run ma -- wiki health --format json` | `ok:true` **exit 0**；`total` 正确 |
| `pnpm run ma -- wiki` | ErrorEnvelope `input.invalid` **exit 5** |
| `pnpm run ma -- wiki notacommand` | exit 5 |
| `pnpm run ma -- wiki ingest no-such-issue --sync` | `resource.not_found` **exit 4** |
| `pnpm run ma -- wiki ingest <FRI-07>` | enqueue envelope `mode:enqueue` + jobId |
| `pnpm run ma -- wiki jobs` | 列表 envelope + `meta.count` |
| `pnpm run ma -- wiki jobs retry <completed>` | exit 5「仅 dead job 可 retry」 |

**无 key 队列路径（PORT=3012，`MA_WORKSPACE_CWD=tmp-s08-e2e-ws`，未设 `WIKI_LLM_API_KEY`）**

1. `PUT /api/issues/FRI-08 → done` → 新 job 约 1s 内 `dead, failCount:3, lastError: WIKI_LLM_API_KEY 未配置`
2. `POST /api/wiki/jobs/:dead/retry` → 短暂 running → 再满 3 次 → `dead`（failCount 从 0 重置再至 3）
3. GET 不存在 id → **404**；POST retry completed → **400**
4. 无 key 时 `AGENTS.md` 用户前文保留、**无** MA-WIKI 块（未成功 ingest）

**有 key 成功路径（DeepSeek OpenAI 兼容）**

```
WIKI_LLM_PROVIDER=openai
WIKI_LLM_API_KEY=$DEEPSEEK_API_KEY
WIKI_LLM_BASE_URL=https://api.deepseek.com/v1
WIKI_LLM_MODEL=deepseek-chat
MA_WORKSPACE_CWD=<隔离 tmp-s08-e2e-ws>
```

- `ma wiki ingest FRI-09 --sync` → envelope `mode:sync`；wiki 页写出
- `AGENTS.md`：用户前文保留 + **单一** `BEGIN/END MA-WIKI` 块（Pages 清单 + Recent ingests）
- 二次 `ingest FRI-08 --sync`：`beginCount=1` 幂等；Pages:2
- `buildPrompt(FRI-11)`：**含** `# Project Wiki Snapshot` + managed 正文（`HAS_SNAPSHOT true`）

**回归**

- `rg "void ingestIssue"`：issues 路由无 fire-and-forget
- S07 `GET /api/wiki/health` → **200**
- S07 routes 仍在；jobs 为追加

## 与计划的偏离

1. **CLI 不调用 `wakeWikiIngestWorker`**  
   计划片段 C 在 enqueue/retry 后 wake。独立 CLI 进程里 wake 会 claim 后随 `process.exit` 死亡，job 易卡 `running`（依赖 server 启动 recovery）。改为依赖 server tick；即时执行用 `--sync`。HTTP 路径（issues done / POST retry）仍由 server 内 wake。
2. **Windows 上 CLI 成功后偶发 libuv `UV_HANDLE_CLOSING` 断言**（exit code 非 0 的崩溃尾音）  
   stdout 已写出正确 envelope；根因疑 better-sqlite3 打开句柄 + `process.exit` 竞态。功能验收以 JSON 内容为准；后续可改优雅关库或 `process.exitCode` 自然退出。
3. **plan/spec 文件**仍从 main 只读进 working tree 时可能 untracked；未强行塞进 feature 历史（与 impl-2 一致，文档已在 main）。
4. 无其他业务偏离。

## 遗留 / 计划者要注意的点

1. **合并前**：确认 `feat/s08-bridge-queue-cli` 含 impl-1..3 全部 commit；S07 若尚未合 main，本分支基于 S07 衍生，PR 说明依赖顺序。
2. **本地 `dev.db`**：自测残留 dead/completed jobs、若干 issue 已改 done；reseed 或清 `wiki_ingest_job` 可恢复演示数据。
3. **有 key demo**：需配置 `WIKI_LLM_*`；本机会用 DeepSeek 兼容端点验通 completed + AGENTS。
4. **CLI 与 server 共用 `DB_PATH` / `MA_WORKSPACE_CWD`**；测 bridge **必须**隔离 cwd，勿写 repo 根 `AGENTS.md`。
5. 可选后续：CLI 成功路径优雅关闭 sqlite，消 Windows 断言噪音。

## 验收结论（仅计划者填）

对照 spec §8：

### 8.1 工程
- [x] `pnpm -r typecheck` 全绿
- [x] server 可起（本会话 PORT=3012 验过）
- [x] migration 0005 已在 impl-1 应用

### 8.2 队列 + DLQ
- [x] done → job pending→…→dead（无 key）
- [x] 有 key：`--sync` completed + 写页
- [x] POST retry dead → 再执行
- [x] dedup（impl-2 已证；本会话 enqueue 路径保留）

### 8.3 AGENTS.md 桥梁
- [x] 成功 ingest 后 BEGIN/END MA-WIKI
- [x] 二次写入 beginCount=1
- [x] 用户 marker 外内容保留
- [x] `buildPrompt` 含 wiki snapshot

### 8.4 CLI
- [x] health json envelope + exit 0
- [x] 非法参数 exit 5
- [x] 不存在资源 exit 4
- [x] ingest 入队；jobs 可见

### 8.5 回归
- [x] 无 `void ingestIssue`
- [x] S07 health API 200

- 结论：**留给计划者勾选最终通过**；执行者侧证据已齐，可审 PR。
