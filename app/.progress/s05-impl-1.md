# Handoff: s05-impl-1

> 切片：`S05` · 角色：`impl` · 序号：`1`
> 日期：2026-07-15
> 分支：`feat/s05-skill-mcp`

## 上下文（给下一个会话读）

S05 切片「Skill（本地目录）+ MCP 配置」的第一个执行者片段。我负责**数据层 + skill 扫描器**——DB schema 改动（删 skill 死表 + agent 加 mcpServers + agent_skill 分配表）、skill 目录扫描器、seed 更新、5 个示例 skill、shared 契约、启动集成。

S05 全图（三个执行者片段）：
- **impl-1（本文件）**：DB + scanner + seed + shared 契约 + 启动扫描 ✅
- impl-2：stdin 修复 + skill/MCP 注入执行层 + API 路由
- impl-3：前端（Skills 页 + agent 详情 Tab + 侧栏）+ 端到端验收

读 [docs/superpowers/specs/2026-07-15-s05-skill-mcp-design.md](../../docs/superpowers/specs/2026-07-15-s05-skill-mcp-design.md) §3/§4/§5 + [plan](../../docs/superpowers/plans/2026-07-15-s05-skill-mcp.md) + 本文件。

## 本会话完成了什么

### Task 1.1: DB schema 改动 + migration（commit 982ec76）
- `server/src/db/schema.ts`：
  - **删除** S01 的 `skills` 死表（id/name/url/createdAt）——spec §3.2b / R6
  - `agents` 表加 `mcpServers: text('mcp_servers')` 列（nullable，MCP 配置 JSON 字符串）——spec §3.3
  - **新增** `agentSkills` 表（`agent_skill`）：`agentId` FK→agent(cascade) + `skillId` text（非 FK，skill 的 name）+ 复合 PK(agentId, skillId) + `idx_agent_skill_agent` 索引——spec §3.2
- migration `0004_skill_mcp.sql`（手写，见偏离记录）：`ALTER agent ADD mcp_servers` + `CREATE TABLE agent_skill` + `CREATE INDEX idx_agent_skill_agent` + `DROP TABLE skill`

### Task 1.2: seed 更新（commit 57446d8）
- `server/src/db/seed.ts`：删 `skills` import + skill insert 整块；加 `agentSkills` 分配 insert（6 行，照 seed.js agent.skillIds）：
  - agt-lead → multica-squads
  - agt-research → extract-prototype-requirements
  - agt-prd → prd-writer, extract-prototype-requirements
  - agt-proto → frontend-design, design-system

### Task 1.3: skill scanner（commit 71e29b1）
- 新建 `server/src/skill/scanner.ts`：
  - `scanSkills()`：扫用户级 `~/.multi-agent/skills/` + 项目级 `{MA_WORKSPACE_CWD}/.skills/`，项目级优先覆盖同名（spec §5.1）
  - 支持两种形态：目录 `<name>/SKILL.md` + 扁平 `<name>.md`
  - `parseFrontmatter()`：简单行解析 name/description（不引 yaml 依赖，spec §5.3）
  - **R4 降级**：无 frontmatter 或缺 name → 用文件名作 name
  - **R5 绝对路径**：`path.resolve(cwd, '.skills')` + cwd 长度检查防空串
  - 内存索引 `Map<name, SkillInfo>`（照 hermes 零足迹，不进 DB）
  - 导出 `getSkillIndex()`（impl-2 的 prompt.ts 用）+ `getSkillsForAgent()`（占位，返回 []，实际查询由调用方做）

### Task 1.4: .skills/ 示例 + shared 契约 + 启动（commit d3d07b7）
- `.skills/` 5 个示例 SKILL.md（目录形态，frontmatter name = 目录名 = seed skillId）：
  prd-writer / extract-prototype-requirements / frontend-design / design-system / multica-squads
- `shared/src/schema.ts`：加 `SkillInfo` 契约（API 响应：name + description + source + usedBy: AgentSummary[]，spec §4.2）
- `server/src/index.ts`：`main()` 启动时调 `scanSkills()`（在 buildApp 前）

## 自测结果

### typecheck（全量）
```
$ pnpm -r typecheck
packages/shared typecheck: Done
packages/server typecheck: Done
packages/web typecheck: Done
```

### migration 0004 应用验证
```
$ rm -f dev.db* && pnpm db:migrate   →  ✓ 迁移完成
```
查表结果：
- tables: agent, agent_run, **agent_skill**, comment, issue, run_message, squad, squad_member, user, workspace（**skill 表已删** ✓）
- agent 列: id, name, category, created_at, runtime, concurrency, **mcp_servers** ✓
- agent_skill 索引: sqlite_autoindex_agent_skill_1（复合 PK）+ idx_agent_skill_agent ✓

### seed 验证
```
$ pnpm db:seed   →  ✓ seed 完成：8 条 issue，6 条 comment
```
agent_skill 6 行（顺序按 agent_id, skill_id）：
```
agt-lead    -> multica-squads
agt-prd     -> extract-prototype-requirements
agt-prd     -> prd-writer
agt-proto   -> design-system
agt-proto   -> frontend-design
agt-research -> extract-prototype-requirements
```

### scanSkills() 扫描验证（临时脚本，已删）
设 `MA_WORKSPACE_CWD="D:\code\multi-agent"` 跑 scanSkills()：
```
扫到 skill 数: 5
names: design-system, extract-prototype-requirements, frontend-design, multica-squads, prd-writer
  [project] design-system: 维护统一设计 token 与组件规范 (body 198 chars)
  [project] extract-prototype-requirements: 从可交互原型反提需求清单 (body 202 chars)
  [project] frontend-design: 按设计系统产出可交互前端原型 (body 166 chars)
  [project] multica-squads: 按小队协议编排 leader/worker 委派闭环 (body 233 chars)
  [project] prd-writer: 将需求转化为结构化 PRD 文档 (body 144 chars)
```
5 个 skill 全部扫到，frontmatter name + description + body 解析正确，source = project。

## 与计划的偏离

**migration 0004 手写（非 drizzle-kit generate）。** 计划 Task 1.1 Step 4 是 `pnpm db:generate`。实际：drizzle-kit 0.24.2 检测到删 `skill` 表 + 加 `agent_skill` 表，弹交互式 rename 选择器（"create table" vs "rename skill→agent_skill"）。本环境非 TTY，`printf '\n'` stdin 回车 + winpty 均无法喂入选择。

改为手写 migration 三件套（照 drizzle 生成的格式）：
1. `0004_skill_mcp.sql`：SQL 语句（DROP + ALTER + CREATE + INDEX），末尾**不加** `--> statement-breakpoint`（drizzle migrator 按它分段，尾部会产空语句报 `contains no statements`，已踩坑修复）
2. `meta/0004_snapshot.json`：基于 0003 snapshot 派生（删 skill 表、agent 加 mcp_servers、加 agent_skill 表），保持 drizzle 内部状态一致，避免下次 generate 冲突
3. `meta/_journal.json`：加 idx=4 entry

语义上明确是 **DROP + CREATE**（不是 rename）——skill 表是死表无数据需迁移，agent_skill 是全新分配表。已验证 migrate + seed + 查表全绿。

## 遗留 / 下一个执行者要注意的点（给 impl-2）

> 不是新计划，是"接着干必须知道的约定"。

### scanner.ts 的接口（impl-2 prompt.ts 直接用）
- **`getSkillIndex()`** 就绪，返回 `Map<string, SkillInfo>`（SkillInfo 含 name/description/body/path/source）。**prompt.ts 里查 agent→skill 不要调 `getSkillsForAgent()`（那是占位返回 []）**，照 plan Task 2.2 自己做：
  ```typescript
  import { eq } from 'drizzle-orm';
  import { agentSkills } from '../db/schema.js';   // ← 从 schema import，表名 agentSkills
  import { getSkillIndex } from '../skill/scanner.js';
  // 查分配 + join 内存索引：
  const assigned = db.select().from(agentSkills).where(eq(agentSkills.agentId, run.agentId)).all();
  const index = getSkillIndex();
  const skills = assigned.map(a => index.get(a.skillId)).filter(...非 null);
  ```
- **scanner 不 import db**（避免循环依赖），所以 agent→skill 查询必须在 prompt.ts（已有 db import）里做。
- 内存索引里 SkillInfo 的 `.body` 就是拼进 prompt 的 skill 正文（plan Task 2.2 的拼接格式：`## Skill: ${name}\n${body}`，用 `\n\n` join）。

### DB 层就绪的契约
- **`agentSkills` 表**（schema.ts 导出，DB 表名 `agent_skill`）：`{ agentId, skillId }` 复合 PK，`agentId` FK→agent onDelete cascade，`skillId` 是 **text 非 FK**（skill name）。**R1 悬空引用**：skill 文件被删后分配关系还在，GET /api/agents/:id/skills 要过滤 `index.has(skillId)`（plan Task 2.4 已含此过滤）。
- **`agents.mcpServers`** 列就绪（text nullable，JSON 字符串）。RunWorker claim 后查：`db.select().from(agents).where(eq(agents.id, runRow.agentId)).get()?.mcpServers ?? null`。
- seed 已插 6 行 agent_skill 分配（见上方自测），agt-lead 有 multica-squads，可用来验证 leader run 的 skill 注入。

### .skills/ 目录约定
- 项目级目录在**仓库根** `D:\code\multi-agent\.skills\`（不是 app/ 下）。每个 skill 是 `<name>/SKILL.md` 目录形态。
- skill name（frontmatter + 目录名）= agent_skill.skillId = scanner 索引 key，三者必须一致。
- 扫描依赖环境变量 **`MA_WORKSPACE_CWD`**（指向项目根），server 进程启动时要有这个 env，否则只扫用户级目录。验证时 `MA_WORKSPACE_CWD="D:\code\multi-agent" pnpm dev`。
- shared 的 `SkillInfo` 契约（schema.ts）是 **API 响应**契约（含 usedBy），与 scanner 内部的 SkillInfo（含 body/path）是**两个不同类型**，别混。API 路由（plan Task 2.4）把 scanner 内部 SkillInfo 映射成 shared SkillInfo（拼 usedBy 反查）。

## 验收结论（计划者填）

### impl-1 验收（2026-07-15 计划者复核）

**结论：✅ 通过，移交 impl-2（stdin 修复 + skill/MCP 注入 + API）。**

复核项：
- ✅ migration 0004：DROP skill + ALTER agent ADD mcp_servers + CREATE agent_skill（复合 PK + 索引），结构正确
- ✅ seed：删 skill insert + agent_skill 6 行分配正确（照 seed.js skillIds）
- ✅ scanner.ts：R4 降级（无 frontmatter 用文件名）+ R5 绝对路径（resolve + 空串检查）+ 两种目录形态 + frontmatter 解析（不引依赖）
- ✅ .skills/ 5 个 SKILL.md，scanSkills() 扫到全部 5 个（name/description/body 正确）
- ✅ shared SkillInfo 契约（API 响应形态，含 usedBy）
- ✅ index.ts 启动 scanSkills()
- ✅ scanner 不 import db（避免循环），agent→skill 查询留给 prompt.ts——handoff 写清了
- ✅ 两种 SkillInfo 类型区分（scanner 内部含 body/path vs shared API 含 usedBy）

**1 处偏离接受**：migration 手写（drizzle-kit 交互式 rename 在非 TTY 无法喂入），三件套（sql + snapshot + journal）格式正确。

**给 impl-2 的计划者补充注意点（impl-1 handoff 之外）：**

1. **scanner 的 getSkillIndex() 就绪**，但 getSkillsForAgent() 是占位返回 []——prompt.ts 里自己查 agent_skill + join getSkillIndex()（impl-1 handoff 已给代码片段）。
2. **claude stdin 修复是 impl-2 第一步（Task 2.1）**：spike 确认 argv（`echo "say hi" | claude -p --output-format stream-json --verbose`），然后改 spawn-line 加 stdinInput + claude-code.ts 改 stdin 传 prompt。这是 S04 遗留 + S05 验收前提。
3. **spawn-line stdinInput 是结构扩展**：不是加几行，spawnLineProcess 签名加参数 + spawn 后 stdin write/end + stdin error 处理。opencode/cursor 不传 stdinInput（保持 argv prompt）。
4. **MCP 临时文件必须 try/finally**（R3）：claude-code.ts 的 execute 方法用 try/finally 包临时文件，即使 abort 兜底触发也清理。
5. **buildPrompt 拼接顺序**：skillBlock + briefing(if leader) + issueBody。注意 briefing 逻辑是 S04 已有的（prompt.ts 里），S05 只是在前面加 skillBlock。
