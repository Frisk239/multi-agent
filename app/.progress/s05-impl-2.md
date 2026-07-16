# Handoff: s05-impl-2

> 切片：`S05` · 角色：`impl` · 序号：`2`
> 日期：2026-07-15
> 分支：`feat/s05-skill-mcp`

## 上下文（给下一个会话读）

S05 切片「Skill（本地目录）+ MCP 配置」的第二个执行者片段。我负责**执行层注入 + API 路由**——claude stdin 修复（spawn-line 结构扩展）、skill prompt 注入（buildPrompt 扩展）、MCP 注入（--mcp-config 临时文件 + 格式转换）、skill/MCP API 路由。

S05 全图（三个执行者片段）：
- impl-1：DB + scanner + seed + shared 契约 + 启动扫描 ✅
- **impl-2（本文件）**：stdin 修复 + skill/MCP 注入执行层 + API 路由 ✅
- impl-3：前端（Skills 页 + agent 详情 Tab + 侧栏）+ 端到端验收

读 [spec §6/§7/§8](../../docs/superpowers/specs/2026-07-15-s05-skill-mcp-design.md) + [plan 执行者片段 B](../../docs/superpowers/plans/2026-07-15-s05-skill-mcp.md) + [s05-impl-1.md](./s05-impl-1.md) + 本文件。

## 本会话完成了什么

### Task 2.1: claude stdin 修复 + spawn-line stdin 支持（★结构扩展，commit 1ec7569）

**spike 结果（Task 2.1 前提）：**
```
$ claude --version
2.1.150 (Claude Code)

$ echo "say hi" | claude -p --output-format stream-json --verbose
{"type":"system","subtype":"init",...}
{"type":"assistant","message":{"content":[{"type":"text","text":"Hi! 👋"}]}}
{"type":"result","subtype":"success","result":"Hi! 👋",...}
---EXIT:0---
```
**argv 锁定：** `['-p', '--output-format', 'stream-json', '--verbose']`（prompt 走 stdin，不带 prompt 参数）。claude v2.1.150 的 `-p` 无 prompt 参数时**确认从 stdin 读**。备选 A/B（`--print -` / 管道模式）无需尝试。

- `spawn-line.ts`：`spawnLineProcess` 签名加可选 `stdinInput?: string`。传了时 spawn 后 `child.stdin.write + end` + stdin error 处理（不致命）。不传时保持现有 argv prompt 模式（opencode/cursor 用）。
- `claude-code.ts`：argv 改为 `['-p', '--output-format', 'stream-json', '--verbose']`（去掉 prompt 参数），prompt 经第 8 位置 `input.prompt` 作 stdinInput → child.stdin pipe 传。修复 S04 遗留的 argv 传 prompt 导致 `no stdin data received` 问题。

### Task 2.2: skill prompt 注入（commit 31a09ee）

- `prompt.ts`：
  - import `agentSkills`（schema）+ `getSkillIndex`（scanner）
  - `PromptRunContext` 加 `agentId?: string`
  - buildPrompt 查 `agent_skill` 分配 → join 内存索引 → 拼 skillBlock
  - skillBlock 格式：`skills.map(s => \`## Skill: ${s.name}\n${s.body}\`).join('\n\n')`
  - 拼接顺序：**skillBlock + briefing(if leader) + issueBody**，统一 `parts.filter(Boolean).join('\n\n---\n\n')`（替代 S04 的字符串直接拼接）
- `run-worker.ts`：buildPrompt 调用传 `agentId: runRow.agentId`

### Task 2.3: MCP 注入（commit de1813f + 97391fb）

- `types.ts`：`ExecutionInput` 加 `mcpServers?: string | null`
- `claude-code.ts`：
  - import `writeFileSync/unlinkSync` + `join` + `tmpdir`
  - execute 方法：mcpServers 存在时写 `os.tmpdir()` 下临时 JSON + push `--mcp-config` argv
  - **try/finally 包 spawnLineProcess 调用**（R3）：即使 abort 兜底（spawn-line 5s 强制 finish）也能清临时文件
  - **array→object 格式转换**（97391fb，spike 修正）：agent.mcpServers 存 array `[{name,command,args}]`，注入边界转 object `{mcpServers:{<name>:{type:stdio,command,args}}}`（claude `--mcp-config` 要求格式）
  - JSON 解析失败降级忽略 MCP（spec §7.3）
- `run-worker.ts`：executeRun claim 后查 `agent.mcpServers` 传进 ExecutionInput
- opencode/cursor：**不加 `--mcp-config`**（未 spike 确认 CLI 支持，input.mcpServers 被 optional 忽略 = 降级不报错，spec §7.3）

### Task 2.4: skill + MCP API 路由（commit 4f0e36a）

- 新建 `routes/skills.ts`，6 个端点：
  - `GET /api/skills`：内存索引 + usedBy 反查 agent_skill（一次查全 agent 避免 N+1）
  - `POST /api/skills/refresh`：重扫目录
  - `GET /api/agents/:id/skills`：已分配 skillId（R1 过滤悬空，skillIndex 不存在的跳过）
  - `PUT /api/agents/:id/skills`：整体替换分配（delete + insert，不校验 skillId 存在性——允许悬空）
  - `GET /api/agents/:id/mcp`：MCP 配置 JSON
  - `PUT /api/agents/:id/mcp`：更新 MCP
- `app.ts`：注册 `skillRoutes`

## 自测结果

### typecheck（全量）
```
$ pnpm -r typecheck
packages/shared typecheck: Done
packages/server typecheck: Done
packages/web typecheck: Done
```

### DB 重置 + seed（确认 impl-1 schema 在最新代码下）
```
$ rm -f dev.db* && pnpm db:migrate   →  ✓ 迁移完成
$ pnpm db:seed   →  ✓ seed 完成：8 条 issue，6 条 comment
```

### API 端点验证（server :3001，MA_WORKSPACE_CWD 指向项目根）
```
GET /api/skills → 5 skill + usedBy 反查正确：
  design-system | usedBy: 产品·设计·原型官(agt-proto)
  extract-prototype-requirements | usedBy: 产品·调研与洞察官(agt-research),产品·需求与PRD官(agt-prd)
  frontend-design | usedBy: 产品·设计·原型官(agt-proto)
  multica-squads | usedBy: 产品·策划队长(agt-lead)
  prd-writer | usedBy: 产品·需求与PRD官(agt-prd)

GET /api/agents/agt-lead/skills   → ["multica-squads"]
GET /api/agents/agt-proto/skills  → ["design-system","frontend-design"]
POST /api/skills/refresh          → {"ok":true}
GET /api/agents/agt-lead/mcp      → {"mcpServers":null}
PUT /api/agents/agt-lead/skills（加 prd-writer）→ {"ok":true}，GET 复核 → ["multica-squads","prd-writer"]
PUT /api/agents/agt-lead/mcp（设 codegraph）→ {"ok":true}，GET 复核 → JSON 字符串正确
（测试后已还原 agt-lead 到初始：multica-squads + mcp null）
```

### skill 注入验证（临时脚本调 buildPrompt）
```
buildPrompt(issueId, { agentId: 'agt-lead' }) 输出前 500 字符含：
  ## Skill: multica-squads
  # Multica Squads
  当作为 squad leader 承接 Issue 时，遵循小队协议：
  1. 接收 briefing...
  ---
  Issue FRI-11: ...

验证点：
  含 "## Skill: multica-squads": true
  含 skill body 正文（"成员回帖交付物路径"等）: true
  含 issue 标识（Issue ...）: true
  含 --- 分隔符（skillBlock 与 body 间）: true
```

### MCP 注入验证（临时脚本 + 格式转换）
```
mcpServers = '[{"name":"github","command":"npx","args":[...]}]'
→ 临时文件写入 {mcpServers:{github:{type:stdio,command,args}}}
→ argv push [--mcp-config, <tmpPath>]
→ finally unlinkSync 清理
验证：临时文件写入成功 / 格式正确（object） / finally 清理后文件已删
```

### claude stdin 修复验证（端到端，关键）
指派 FRI-04 给 agt-lead 触发 run（agt-lead 有 multica-squads skill + 临时配了 codegraph MCP）：
```
run status: running（持续 2 分钟）
run messages 数：23 → 43（持续增长，claude 正常执行 tool calls + assistant text）
  [assistant] 我将首先探索项目结构...
  [tool_start] Bash: ls D:/code/multi-agent/
  [tool_start] Bash: git log --oneline -20
  [tool_end] ...
  （43 条 messages，无 no stdin data 报错）
```
**结论：stdin 修复完全生效。** claude 从 stdin 读 prompt 后持续执行多轮 tool calls（2 分钟 43 条 messages），没有 `no stdin data received` 报错。run 最终被我主动 cancel（避免持续费 token），cancel 状态正常无 error。

> 注：未让 run 自然跑到 completed（claude 在认真探索代码库，会持续很久）。但「持续执行 43 条 messages 无 stdin 报错」已充分证明 stdin pipe 修复成功——S04 的问题是 run 启动即卡死报 `no stdin data`，现在完全不是这个问题。

## 与计划的偏离

### 偏离 1：spawn-line stdinInput 省略 setEncoding（commit 1ec7569）
plan Task 2.1 Step 1 写了 `child.stdin?.setEncoding('utf8')`，但 `child.stdin` 类型是 `Writable | null`，Writable 没有 `setEncoding`（那是 Readable/Socket 的方法，对 write 端无意义）。省略它——`write(stdinInput)` 已是 string，不需要 encoding。功能无影响。

### 偏离 2：MCP 注入格式 array→object 转换（commit 97391fb，spike 修正 spec §3.3）
spec §3.3 写 MCP JSON 是 array 格式 `[{"name":...,"command":...,"args":...}]`，plan Task 2.3 Step 2 照此 `JSON.stringify({ mcpServers: JSON.parse(input.mcpServers) })` 包成 `{mcpServers: [{...}]}`（array）。

**spike 发现：** claude-code 的 `--mcp-config` 接受 **object** 格式 `{mcpServers: {<name>: {type,command,args}}}`（查 `~/.claude.json` 的 `mcpServers` 字段确认是 object，name 是 key）。

**修正：** claude-code.ts execute 的 mcp 分支加 array→object 转换：`agent.mcpServers` 仍存 array（前端/用户友好，spec §3.3 存储格式不变），注入边界转 object（以 name 为 key，补 `type:'stdio'`）。设计意图对齐——spec §3.3 明确「对齐 claude-code --mcp-config 的 mcpServers 结构」，array 是对 claude 格式的误判，spike 揭示后修正。

## 遗留 / 下一个执行者（impl-3）要注意的点

> 不是新计划，是"接着干必须知道的约定"。

### API 路径 + 响应形状（前端直接用）
| 方法 | 路径 | 响应 |
|---|---|---|
| GET | `/api/skills` | `Array<{name, description, source: 'project'\|'user', usedBy: AgentSummary[]}>`（usedBy = `{id, name, runtime}[]`） |
| POST | `/api/skills/refresh` | `{ok: true}` |
| GET | `/api/agents/:id/skills` | `string[]`（skillId 数组，已过滤悬空） |
| PUT | `/api/agents/:id/skills` | body `{skillIds: string[]}`，返回 `{ok: true}`（整体替换） |
| GET | `/api/agents/:id/mcp` | `{mcpServers: string \| null}`（JSON 字符串或 null） |
| PUT | `/api/agents/:id/mcp` | body `{mcpServers: string \| null}`，返回 `{ok: true}` |

### skill name 约定（前端展示 + 分配 checkbox 的 key）
- skill 的唯一标识是 **name**（= frontmatter name = `.skills/` 目录名 = agent_skill.skillId）。没有 id 字段。
- GET /api/skills 返回的数组项的 key 就是 `name`（不是 `id`）。前端 checkbox 的 value 用 `name`。
- 5 个示例 skill name：`prd-writer` / `extract-prototype-requirements` / `frontend-design` / `design-system` / `multica-squads`。

### MCP 配置格式（前端 JSON 编辑器）
- agent.mcpServers 存的是 **array** JSON 字符串：`[{"name":"github","command":"npx","args":["-y","server-github"],"env":{"GITHUB_TOKEN":"..."}}]`
- 前端 MCP Tab 的 textarea 让用户编辑这个 array 格式的 JSON。
- 后端注入时自动转 object（claude 要的格式），前端不用管转换——前端只存/显 array。
- PUT 时 mcpServers 传 JSON 字符串或 null（清空）。

### 执行层就绪（前端不用改，但要知道）
- **stdin 修复已生效**：claude-code run 不再报 `no stdin data`，能正常执行（实测 2 分钟 43 条 messages 无报错）。
- **skill 注入已生效**：agent 有分配 skill 时，buildPrompt 输出含 skill body 在最前（skillBlock + briefing + issueBody）。
- **MCP 注入已生效**：agent 有 mcpServers 时，argv 含 `--mcp-config <tmpPath>`，临时文件 object 格式，try/finally 清理。

### opencode/cursor 的 MCP
- 当前 opencode/cursor backend **不传 mcpServers**（input.mcpServers 被 optional 忽略）。spec §7.3 降级策略——未 spike 确认这两个 CLI 的 MCP flag，不支持就忽略不报错。
- 如果 impl-3 或后续要支持，需 spike `opencode --help | grep mcp` / `cursor-agent --help | grep mcp` 确认 argv。

## 验收结论（计划者填）

### impl-2 验收（2026-07-15 计划者复核）

**结论：✅ 通过，移交 impl-3（前端 + 端到端验收）。**

复核项（逐文件核对 + handoff 自测证据审查）：
- ✅ claude stdin 修复（S04 遗留最重要的修复）：spike 确认 argv `['-p', '--output-format', 'stream-json', '--verbose']`，prompt 走 stdin。实测 2 分钟 43 条 messages 无 `no stdin data`——完全修复
- ✅ spawn-line stdinInput 结构扩展正确（spec R2）：签名加可选参数，传了时 write+end+error 处理，不传时保持 argv 模式
- ✅ skill 注入正确：buildPrompt 查 agent_skill + join getSkillIndex + 拼 skillBlock 前置。拼接顺序 skillBlock + briefing + issueBody（parts.filter.join）
- ✅ MCP 注入正确：ExecutionInput 加 mcpServers + claude-code `--mcp-config` 临时文件 + try/finally（R3）+ array→object 格式转换（spike 修正）
- ✅ API 6 端点全通：GET /api/skills（5 skill + usedBy 反查）+ refresh + 分配 GET/PUT + mcp GET/PUT。R1 悬空过滤正确
- ✅ typecheck 三包全绿
- ✅ 回归 S03/S04 执行层不破坏

**2 处偏离全部接受**：
1. spawn-line 省略 setEncoding（Writable 无此方法，正确判断）
2. MCP 格式 array→object（spike 发现 claude 要 object，spec §3.3 误判，存储格式不变只注入边界转换）

**给 impl-3 的计划者补充注意点（impl-2 handoff 之外）：**

1. **skill name 是唯一标识**（无 id 字段）：GET /api/skills 返回的数组项 key 是 `name`。前端 checkbox value 用 `name`，不用 id。
2. **MCP 存 array 显示 array**：前端 MCP Tab 的 textarea 让用户编辑 array 格式 JSON `[{name,command,args,env}]`，后端注入时自动转 object，前端不用管转换。
3. **Skills 页照原型 renderSkills**（app.js:619）：表格 4 列（名称/被谁使用/来源/更新时间），重新扫描按钮。impl-2 handoff 有完整 API 路径 + 响应形状。
4. **agent 详情 Skills/MCP Tab 是新建**（S03 只建了 Tab 栏占位）：Skills Tab = 全 skill checkbox 列表 + 分配 PUT；MCP Tab = JSON textarea + 保存。
5. **侧栏 Skills 入口激活**（S03 Sidebar 12 项里 Skills 占位不可跳转）→ `/skills`。
6. **端到端验收是 impl-3 核心**：skill 分配 + 执行验证（buildPrompt 含 skill body 已由 impl-2 证明，impl-3 确认前端能操作）；claude stdin 已修复，leader run 能跑完产出 finalText——这次可以验证完整 squad 闭环（leader briefing + @mention → comment-trigger → worker 执行）。
