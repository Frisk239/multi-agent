# 补4 设计 — Settings / 环境诊断（G0 只读）

> 状态：**待用户审阅 spec 正文** · 日期：2026-07-17  
> 切片：补充阶段 **补4** / `bu04` · 建议分支：`feat/bu04-settings`  
> 前置：补1–补2 已合 main；**补3 建议已合**（无硬依赖，可并行文档）  
> 依据：补充阶段能力包 **G**；Multica Settings 多 Tab / `AgentReadiness` / Desktop Daemon 诊断对照；用户锁定 **G0**  
> 计划者只出设计；实现另派。本文件阶段不写业务代码。

---

## 0. 摘要

新增 **`GET /api/settings/status`**（只读聚合诊断）+ **`/settings` 页** + 侧栏与 Ctrl+K 入口，一屏解释「为什么跑不起来」。

**G0 锁定：**

- **只读**：不写 env、不写 `.env.local`、不在 UI 编辑 cwd/API key  
- **密钥**：响应与 UI **永不回传**密钥全文（仅 `configured: boolean`）  
- **不抄** Multica Web Settings 全集（账号 / members / GitHub / tokens / integrations）

**一句话验收：** 未配置 `MA_WORKSPACE_CWD` 时 `/settings` 显示 error + 明确 hint；关键项就绪后 `overall` 不为 `blocked`；Network 面板无密钥明文。

---

## 1. 背景

### 1.1 补充阶段位置

| 刀 | 包 | 状态（写 spec 时） |
|---|---|---|
| 补1 | A+B 可靠性 + Inbox | ✅ |
| 补2 | C+D Agent/Squad 运营 | ✅ |
| 补3 | E 快速派活 | 实现中 / 待合 |
| **补4** | **G Settings 诊断** | 本 spec |
| 补5 | F Autopilot | 未开 |

退出清单仍缺：*Settings 能显示 cwd / runtime / LLM·embed 是否就绪*。

### 1.2 现状碎片

| 能力 | 现位置 |
|---|---|
| cwd | `GET /api/runtimes` → `machine.cwd`；缺则 run fail |
| runtime 安装 | `/runtimes`；`computeAgentReadiness`（补2） |
| Wiki LLM | 失败文案提 `WIKI_LLM_API_KEY` |
| Memory | `GET /api/memory/status`；`MEMORY_PROVIDER` / embed env |
| 设置入口 | S12 起侧栏隐藏，无 `/settings` |

### 1.3 Multica 对照（决策依据）

| Multica | 我们学什么 |
|---|---|
| Web Settings 多 Tab（profile/repos/GitHub/…） | **不抄**——云协作面，非本地 MVP |
| `AgentReadiness` 单一真源 | 扩展「全局 env + detect」聚合，与 agent 级 readiness 互补 |
| Desktop `DaemonSettingsTab` DiagnosticsRow | **学** label + 状态 + 详情只读行 |
| Workspace `settings` JSONB PATCH | 不做密钥/env 写入 |
| Runtime 设置独立路由 | 保留 `/runtimes`，settings **链接**过去 |

### 1.4 决议

| 代号 | 决议 |
|---|---|
| G0 | 只读诊断；不写 env/密钥 |
| G1/G2 | 明确 **本刀不做**（cwd UI 写入 / key 表单） |
| P1 | 单一 API 聚合，前端少算 |
| P2 | overall 含 `blocked`（硬门槛，如无 cwd） |
| P3 | 厚切片两棒：API → UI |

---

## 2. API

### 2.1 `GET /api/settings/status`

无 body。鉴权与现网一致（本地单用户）。

**响应（shared Zod 锁定语义）：**

```ts
export const SettingsCheckStatus = z.enum(['ok', 'warn', 'error']);
export const SettingsOverall = z.enum(['ok', 'degraded', 'blocked']);

export const SettingsCheck = z.object({
  id: z.string(), // 'cwd' | 'runtime:claude-code' | 'wiki_llm' | ...
  label: z.string(),
  status: SettingsCheckStatus,
  detail: z.string().nullable(),
  hint: z.string().nullable().optional(),
  href: z.string().nullable().optional(), // 前端路径如 /runtimes
});

export const SettingsStatusResponse = z.object({
  overall: SettingsOverall,
  summary: z.object({
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
  }),
  checks: z.array(SettingsCheck),
  secrets: z.object({
    wikiLlmConfigured: z.boolean(),
    embeddingConfigured: z.boolean(),
  }),
  server: z.object({
    port: z.number().int().optional(),
    // 禁止敏感 env 全文
  }),
});
```

### 2.2 检查项（Must）

| id | label 示例 | ok | error | warn | href |
|---|---|---|---|---|---|
| `cwd` | 工作区目录 | `MA_WORKSPACE_CWD` 非空且路径存在 | 未配置 / 不存在 | — | null 或文档 hint |
| `runtime:claude-code` | Claude Code | `detect().installed` | 未安装 | 已装但 version 空 | `/runtimes` |
| `runtime:opencode` | OpenCode | 同上 | 同上 | 同上 | `/runtimes` |
| `runtime:cursor` | Cursor | 同上 | 同上 | 同上 | `/runtimes` |
| `wiki_llm` | Wiki LLM | `WIKI_LLM_API_KEY` 非空 | 未配置 | — | `/wiki` 可选 |
| `embedding` | Embedding | `EMBEDDING_API_KEY` 或 `OPENAI_API_KEY` 非空 | 未配置 | MEMORY_PROVIDER=pgvector 时 error 更硬；sqlite-text 可为 warn | `/memory` |
| `memory` | 记忆层 | `memoryManager.getStatus().available` | unavailable | provider 名在 detail | `/memory` |
| `server` | 服务 | 始终 ok（能响应即存活） | — | — | null |

**overall 规则（锁定）：**

- 任一 check `error` 且 id 为 **`cwd`** → `blocked`（run 硬失败）  
- 否则存在任一 `error` → `degraded`  
- 仅有 `warn`、无 error → `degraded`  
- 全 `ok` → `ok`  

（实现可把「无任何 runtime installed」也升为 `blocked` 或 `degraded`——**推荐 degraded + errors 计数**，避免本机只装一个 CLI 时误 blocked。**锁定：仅 cwd 缺失必 blocked**；零 runtime 安装 → 全部 runtime 行为 error，overall=`degraded`。）

### 2.3 实现要点

- 路由：`app/packages/server/src/routes/settings.ts`，在 `app.ts` 注册  
- 复用 `allBackends().detect()`、`memoryManager.getStatus()`  
- cwd：`fs.existsSync`（或 `stat`）；detail 可显示路径字符串（路径非密钥）  
- **禁止**把 `process.env.WIKI_LLM_API_KEY` 等写入 JSON  

### 2.4 可选（非 Must）

- `agents` 摘要：`{ total, ready, blocked }` 扫 seed/全部 agent 调 `computeAgentReadiness`——注意 N 次 detect 成本，可缓存或省略  
- **G0 默认不做** agent 摘要，避免厚与慢；二期再加  

---

## 3. 前端

### 3.1 路由与导航

- 页面：`app/packages/web/app/settings/page.tsx` → `SettingsPage` 组件  
- 侧栏 `config` 区增加：`{ id: 'settings', label: '设置', icon: 'settings', href: '/settings' }`  
- Ctrl+K：导航「设置」→ `/settings`  

### 3.2 UI 结构

1. 标题：**环境诊断**  
2. Overall 徽章：`ok` / `degraded` / `blocked` + summary「N 项错误 · M 项警告」  
3. Checks 列表：  
   - 排序：`error` → `warn` → `ok`  
   - 行：色点、label、detail、hint、链接按钮（有 `href` 时）  
4. 页脚说明：「本页只读。请在启动 server 的环境中配置变量（如 `MA_WORKSPACE_CWD`、`WIKI_LLM_API_KEY`）。」  
5. **无**表单输入  

视觉：对齐 Multica Desktop Diagnostics 的「label 列 + 值列」，用现有 CSS 变量即可。

### 3.3 数据

```ts
useSettingsStatus() // queryKey: ['settings-status'], GET /api/settings/status
```

错误：EmptyState + toast 可选。

---

## 4. 与现有功能边界

| 模块 | 关系 |
|---|---|
| `/runtimes` | 保留；settings 链入 |
| Agent readiness | 保留 per-agent；settings 不做完整复制 |
| Wiki/Memory 页内错误 | 保留；settings 给全局一览 |
| 补3 quick-create | 无耦合 |

---

## 5. 非目标

- G1/G2：UI 写 cwd、写 API key、写 `.env`  
- Autopilot / 自动化页（补5）  
- 多用户、workspace JSON settings、PAT、OAuth  
- 固化 e2e  
- 修改补3 分支契约  

---

## 6. 执行拆分（预告，非 plan）

| 棒 | Tasks |
|---|---|
| **impl-1** | shared 类型 + `GET /api/settings/status` + smoke |
| **impl-2** | Settings 页 + 侧栏 + cmdk + 回归 handoff |

分支：`feat/bu04-settings`。  
**建议**补3 合 main 后开实现；spec/plan 文档可先合 main。

---

## 7. 验收清单

- [ ] `GET /api/settings/status` 200，shape 符合 shared  
- [ ] 无密钥字段出现在响应  
- [ ] 缺 `MA_WORKSPACE_CWD` → cwd check error，overall `blocked`  
- [ ] `/settings` 可打开；侧栏与 Ctrl+K 可达  
- [ ] runtime 行可点到 `/runtimes`  
- [ ] typecheck；issues/wiki/memory/inbox 回归 200  

---

## 8. 修订记录

| 日期 | 内容 |
|---|---|
| 2026-07-17 | Brainstorm + Multica 调研；用户锁定 G0；成文 |
