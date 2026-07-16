# S05 设计 spec — Skill（本地目录）+ MCP 配置

> 状态：草案（待用户复核） · 日期：2026-07-15 · 切片：S05 · 建议分支：`feat/s05-skill-mcp`
> 真源依据：[AGENTS.md](../../../AGENTS.md) · [design/slices.md](../../../design/slices.md) S05 · [design/synthesis.md](../../../design/synthesis.md) §2.6（skill/MCP 注入）· [references/deep/hermes-memory-delegate.md](../../../references/deep/hermes-memory-delegate.md) §3（Footprint Ladder + Skills 系统）· [chanpin/prototype/data/seed.js](../../../chanpin/prototype/data/seed.js) skills[] · RTM UI-SKL / UI-AGT-009~012 · claude-code `--mcp-config` / `--help`
> 前置：[s04-planner-2.md](../../../app/.progress/s04-planner-2.md)（S04 收尾 + claude stdin 遗留）
> 产出流程：brainstorming（本文件）→ writing-plans → 执行者拆分

## 0. 摘要

S05 是 Phase 1 最后一个切片，点亮 FRI-11 答辩路径的最后一段。两块：
- **Skill**：从本地目录（项目级 `.skills/` + 用户级 `~/.multi-agent/skills/`）扫描 SKILL.md（照 hermes/zcode/claude-code 约定），内存索引（不进 DB），按 agent 分配（分配关系进 DB），执行时拼进 prompt（照 hermes，进 user prompt 不进 system prompt）
- **MCP**：agent 表存 mcpServers JSON，agent 详情 MCP Tab 编辑，执行时写临时文件传 `--mcp-config` 给 CLI

前置修复：claude-code backend 的 stdin 问题（S04 遗留）。

**一句话验收：** `.skills/` 放真实 skill → agent 详情分配 → 执行时 prompt 含 skill 内容；MCP 配 JSON → 执行时 `--mcp-config` 生效；claude stdin 修复后 leader run 能跑完。

---

## 1. 范围与架构边界

### 1.1 数据流

```
【Skill】
.skills/ 或 ~/.multi-agent/skills/ 目录
  → 启动时扫描 SKILL.md（YAML frontmatter + markdown body）
  → 内存索引 Map<name, SkillInfo>（不进 DB，照 hermes 零足迹）
  → agent_skill 分配（agent 详情 Skills Tab 勾选 → DB）
  → 执行时 buildPrompt 把分配的 skill body 拼进 prompt（user 侧，保 cache）

【MCP】
agent 详情 MCP Tab（JSON 编辑器）
  → 存 agent.mcpServers（DB text JSON 字符串）
  → 执行时 backend 写临时 JSON 文件 → --mcp-config 传给 CLI
  → CLI 自己连 MCP server + 注册工具（我们是配置传递者）
```

### 1.2 S05 五块

| 块 | 内容 |
|---|---|
| **前置：claude stdin 修复** | 修 S04 遗留的 `no stdin data` 问题 |
| **skill 目录扫描** | 项目级 + 用户级合并扫，解析 SKILL.md，内存索引 |
| **skill API + 分配** | skill CRUD 读内存；agent_skill 关联表；分配 API |
| **skill prompt 注入** | buildPrompt 扩展：agent 分配的 skill body 拼进 prompt |
| **MCP 配置 + 注入** | agent 表加 mcpServers；MCP Tab；backend `--mcp-config` |

### 1.3 不在范围内（YAGNI）

| 排除 | 原因 |
|---|---|
| skill URL 导入 | 改为本地目录读取（K3 决策，照 hermes/zcode）|
| skill 版本管理 / 更新检测 | YAGNI |
| MCP server 健康检查 / 连接测试 | CLI 自己连，我们不枚举 |
| MCP 工具列表展示 | CLI 自己暴露工具 |
| skill slash 命令展开 | hermes 的 `/skill` 机制，我们是 prompt 拼接 |
| skill 内容进 DB | 照 hermes 零足迹，文件系统真源 + 内存索引 |

---

## 2. 决策记录（brainstorm）

| 代号 | 决议 | 依据 |
|---|---|---|
| K1 | Skill + MCP 都做 | 答辩最后一段 |
| K2 | skill 内容拼进 prompt（user 侧，不进 system prompt）| hermes Footprint Ladder 阶 2 + 保 cache |
| K3 | skill 从本地目录读取（非 URL）| 照 hermes/zcode/claude-code 约定，纯本地理念 |
| K4 | skill 本身不进 DB，内存索引；分配关系进 DB | hermes 零足迹 + 分配需持久化 |
| K5 | 项目级 + 用户级目录都扫，合并去重 | 照 hermes `external_dirs` + opencode/claude-code 约定 |
| K6 | MCP JSON 存储 + `--mcp-config` 注入 | claude-code `--mcp-config` 支持 JSON 文件/字符串 |
| K7 | claude stdin 修复纳入 S05 前置 | S04 遗留，影响闭环 + skill 执行验证 |

---

## 3. 数据模型

### 3.1 skill：文件系统真源 + 内存索引（不进 DB）

照 hermes `scan_skill_commands`（`skill_commands.py:320-429`）：启动时扫目录，建内存 dict，不写 DB。

**SKILL.md 格式（照 hermes + zcode）：**

```markdown
---
name: prd-writer
description: 将需求转化为 PRD 文档
---

# PRD Writer

当用户要求产出 PRD 时，按以下结构...
```

- frontmatter：`name`（唯一标识，用于 agent_skill 关联）+ `description`（Skills 页展示）
- body：markdown 正文（拼进 prompt 的内容）

**目录约定（两种形态都支持）：**
- `.skills/<name>/SKILL.md`（目录形态，可含 references/ templates/ 子目录）
- `.skills/<name>.md`（扁平形态）

**扫描目录（两个，合并去重）：**
1. `{MA_WORKSPACE_CWD}/.skills/`（项目级）
2. `~/.multi-agent/skills/`（用户级）

项目级优先（同名 skill 项目级覆盖用户级）。

**内存索引类型：**
```typescript
interface SkillInfo {
  name: string;
  description: string;
  body: string;
  path: string;
  source: 'project' | 'user';
}
// Map<name, SkillInfo>
```

### 3.2 agent_skill 关联表（进 DB）

分配关系必须持久化（用户配置决策，不在 SKILL.md 里）：

```typescript
agent_skill(
  agent_id  text FK→agent PK,
  skill_id  text PK,          // skill 的 name（非 FK，skill 表不在 DB）
)
PK = (agent_id, skill_id)
```

> **悬空引用处理（R1）**：skill_id 是文本非 FK，可能指向已被删的 skill（文件系统里不存在）。GET /api/agents/:id/skills 返回时过滤掉 skillIndex 里不存在的 skillId（悬空引用不展示，不 crash）。PUT /api/agents/:id/skills 不校验（允许存悬空引用——文件系统可能稍后恢复）。

### 3.2b 删除 S01 的 skill 死表（R6）

S01 建的 `skill` 表（id/name/url/createdAt）+ seed 5 行——S05 改为文件系统真源后变死表。migration 0004 `DROP TABLE skill` + 删 seed.ts 的 skill insert。干净清理，避免后续执行者困惑。

### 3.3 agent 表扩展（MCP）

| 新列 | 类型 | 说明 |
|---|---|---|
| `mcp_servers` | text nullable | MCP 配置 JSON 字符串 |

JSON 格式（对齐 claude-code `--mcp-config` 的 mcpServers 结构）：
```json
[
  {"name": "github", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": {"GITHUB_TOKEN": "..."}}
]
```

### 3.4 seed 数据

`.skills/` 目录放 5 个示例 skill（照 seed.js 的 skills[] 名称）：
- `prd-writer`（to-prd）
- `extract-prototype-requirements`
- `frontend-design`
- `design-system`
- `multica-squads`

每个含 SKILL.md（frontmatter + 简短 body，答辩 demo 可见）。

agent_skill 分配（照 seed.js agent.skillIds）：
- agt-lead → multica-squads
- agt-research → extract-prototype-requirements
- agt-prd → prd-writer, extract-prototype-requirements
- agt-proto → frontend-design, design-system

---

## 4. API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/skills` | 内存索引 skill 列表（含 usedBy 反查 agent_skill） |
| POST | `/api/skills/refresh` | 重扫目录刷新索引 |
| GET | `/api/agents/:id/skills` | 返回该 agent 已分配的 skillId 列表 |
| PUT | `/api/agents/:id/skills` | 更新分配（body: `{skillIds: string[]}` 整体替换） |
| GET | `/api/agents/:id/mcp` | 返回 mcpServers JSON |
| PUT | `/api/agents/:id/mcp` | 更新 MCP（body: `{mcpServers: string}` JSON 字符串） |

### 4.1 GET /api/skills 响应

```typescript
Array<{
  name: string;
  description: string;
  source: 'project' | 'user';
  usedBy: AgentSummary[];  // 反查 agent_skill → agent join
}>
```

### 4.2 shared 契约扩展

```typescript
export const SkillInfo = z.object({
  name: z.string(),
  description: z.string(),
  source: z.enum(['project', 'user']),
  usedBy: z.array(AgentSummary),
});
export type SkillInfo = z.infer<typeof SkillInfo>;
```

---

## 5. skill 扫描（启动时 + 手动刷新）

### 5.1 扫描器

新建 `server/src/skill/scanner.ts`：

```typescript
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

let skillIndex = new Map<string, SkillInfo>();

export function scanSkills(): void {
  const next = new Map<string, SkillInfo>();
  // 用户级先扫（低优先级）
  scanDir(join(homedir(), '.multi-agent', 'skills'), 'user', next);
  // 项目级后扫（覆盖同名）。R5：用 path.resolve 确保绝对路径
  const cwd = process.env.MA_WORKSPACE_CWD;
  if (cwd && cwd.length > 0) scanDir(resolve(cwd, '.skills'), 'project', next);
  skillIndex = next;
}

function scanDir(dir: string, source: 'project' | 'user', out: Map<string, SkillInfo>): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // 目录形态：<name>/SKILL.md
    if (entry.isDirectory()) {
      const skillFile = join(dir, entry.name, 'SKILL.md');
      if (existsSync(skillFile)) parseAndStore(skillFile, source, out);
    }
    // 扁平形态：<name>.md
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'SKILL.md') {
      parseAndStore(join(dir, entry.name), source, out);
    }
  }
}

function parseAndStore(path: string, source: 'project' | 'user', out: Map<string, SkillInfo>): void {
  const raw = readFileSync(path, 'utf8');
  const { frontmatter, body } = parseFrontmatter(raw);
  // R4 降级：无 frontmatter 或缺 name → 用文件名作 name，全文作 body
  const name = frontmatter.name ?? basename(path, '.md');
  out.set(name, {
    name,
    description: frontmatter.description ?? '',
    body,
    path,
    source,
  });
}

// YAML frontmatter 解析（简单实现，不引依赖：解析 --- 分隔的第一段）
function parseFrontmatter(raw: string): { frontmatter: { name?: string; description?: string }; body: string } {
  // ...（简单行解析 name:/description: + --- 分隔 body）
}

export function getSkillIndex(): Map<string, SkillInfo> { return skillIndex; }
export function getSkillsForAgent(agentId: string): SkillInfo[] {
  // 查 agent_skill → skillIndex.get(skillId)
}
```

### 5.2 启动时扫描

`index.ts` 在 `startRunWorker()` 前调 `scanSkills()`。

### 5.3 frontmatter 解析

不引 yaml 依赖（照 hermes 用正则/行解析）。简单解析 `---` 分隔块里的 `name:` 和 `description:` 行。复杂 YAML 不支持（YAGNI，skill frontmatter 只有这两个字段）。

---

## 6. skill prompt 注入（改 buildPrompt）

### 6.1 buildPrompt 扩展

S04 的 `buildPrompt(issueId, run?)` 的 run context 加 `agentId`。S05 用它查 agent_skill：

```typescript
// buildPrompt 内，组装最终 prompt 前：
const skills = run?.agentId ? getSkillsForAgent(run.agentId) : [];
const skillBlock = skills.length > 0
  ? skills.map(s => `## Skill: ${s.name}\n${s.body}`).join('\n\n')
  : null;

// 拼接顺序（S05 新增 skill 前置）：
// leader run: skillBlock + briefing + issueBody
// 普通 run:   skillBlock + issueBody
const parts = [skillBlock, /* briefing if leader */, issueBody].filter(Boolean);
return parts.join('\n\n---\n\n');
```

> **skill 前置于一切**：skill 是"执行方法论"（如 PRD Writer 怎么写），逻辑上先于角色 briefing 和具体任务。

### 6.2 RunWorker 集成

executeRun 调 buildPrompt 时传 agentId：
```typescript
const prompt = buildPrompt(runRow.issueId, {
  isLeader: runRow.isLeader === 1,
  squadId: runRow.squadId,
  agentId: runRow.agentId,  // S05 新增
});
```

---

## 7. MCP 配置 + 注入

### 7.1 backend execute 扩展

`ExecutionInput` 加 `mcpServers?: string | null`（JSON 字符串）。

### 7.2 claude-code backend

```typescript
const args = ['-p', input.prompt, '--output-format', 'stream-json', '--verbose'];
if (input.mcpServers) {
  const tmpPath = writeTmpMcpConfig(input.mcpServers);  // 写临时 JSON 文件
  args.push('--mcp-config', tmpPath);
}
```

**R3 临时文件清理**：`writeTmpMcpConfig` 写 `os.tmpdir()` 下的临时文件。claude-code backend 的 execute 方法必须用 **try/finally** 包住——即使 abort 兜底（spawn-line 5s 强制 finish）触发，execute 的 await 返回后 finally 也能清理临时文件。`writeTmpMcpConfig` 把 JSON 包成 `{"mcpServers": {...}}` 格式（claude-code 的 `--mcp-config` 接受的格式）。

### 7.3 opencode/cursor backend

视 CLI 实际 MCP 支持 spike 确认 argv。不支持则忽略 mcpServers（降级，不报错）。

### 7.4 RunWorker 集成

executeRun claim 后查 agent.mcpServers，传入 ExecutionInput：
```typescript
const agentRow = db.select().from(agents).where(eq(agents.id, runRow.agentId)).get();
const mcpServers = agentRow?.mcpServers ?? null;

await backend.execute(
  { prompt, cwd, issueId, agentId, runId, mcpServers },
  onEvent, signal,
);
```

---

## 8. 前置：claude stdin 修复

### 8.1 问题

S04 遗留：`claude -p <prompt>` 3s 后报 `no stdin data received`。根因：prompt 经 argv 传递过长 + claude 仍等 stdin。

### 8.2 修复方向（spike 钉死）

改用 stdin pipe 传 prompt。claude-code 支持从 stdin 读 prompt（`-p` + stdin，或管道模式）。具体 argv 需 spike：

```typescript
// 可能的修复：
const child = spawn(path, ['--output-format', 'stream-json', '--verbose', '-p'], ...);
child.stdin.write(input.prompt);
child.stdin.end();
```

> **R2 结构性改动**：spawn-line.ts 当前只支持 argv prompt。stdin 模式需要：
> 1. spawnLineProcess 加可选参数 `stdinInput?: string`
> 2. 传了 stdinInput 时，spawn 后 `child.stdin.write(stdinInput); child.stdin.end()`，args 不含 prompt
> 3. 不传时，保持现有 argv prompt 模式（opencode/cursor 用）
> 4. stdin error 处理（child.stdin.on('error')）
>
> 这是 spawn-line 的结构性扩展，不是小改。需在 S05 impl 开工第一步 spike 确认 claude stdin argv，然后改 spawn-line。

---

## 9. 前端

### 9.1 Skills 页（RTM UI-SKL-001~006）

新增路由 `/skills`，照原型 `renderSkills`（app.js:619）：
- 页头：`Skills` + count + "重新扫描"按钮（POST /api/skills/refresh）
- 搜索框
- 表格 4 列：名称 / 被谁使用 / 来源 / 更新时间
- 侧栏 Skills 入口激活（S03 建了占位）

### 9.2 agent 详情 Skills Tab（RTM UI-AGT-011）

- 列出全部 skill（GET /api/skills）
- checkbox 勾选分配 → PUT /api/agents/:id/skills
- 已分配显示 skill-tag

### 9.3 agent 详情 MCP Tab（RTM UI-AGT-012）

- JSON 编辑器（textarea）
- 保存 → PUT /api/agents/:id/mcp
- 清空按钮

---

## 10. 验收标准

### 10.1 工程
- [ ] `pnpm -r typecheck` 全绿
- [ ] `pnpm dev` 起 server + web

### 10.2 前置：claude stdin
- [ ] claude-code backend 不再报 `no stdin data`，run 能跑完产出 finalText

### 10.3 skill 目录扫描
- [ ] `.skills/` 放 SKILL.md → GET /api/skills 可见
- [ ] 用户级目录同步可见
- [ ] 项目级 + 用户级同名 → 项目级优先
- [ ] "重新扫描"生效

### 10.4 skill 分配 + 注入
- [ ] agent 详情 Skills Tab 能勾选分配
- [ ] 分配后执行 → buildPrompt 含 skill body（临时脚本验证）
- [ ] Skills 页"被谁使用"列正确

### 10.5 MCP 配置 + 注入
- [ ] MCP Tab JSON 编辑器能保存
- [ ] 分配 MCP 后执行 → argv 含 `--mcp-config`（日志验证）

### 10.6 回归
- [ ] S01-S04 全不破坏

### 10.7 答辩路径
- [ ] **FRI-11 全路径点亮**：看板 → 时间线 → 指派 squad → leader briefing → @mention → worker（带 skill）→ 汇报

### 10.8 不验收
- ❌ skill 版本管理 / 更新检测
- ❌ MCP 连接测试 / 工具枚举
- ❌ skill slash 命令展开

---

## 11. 本切片抄自（Borrow matrix）

| ID | 能力 | 主抄 | 深读锚点 | 我们落点 | 简化/不抄 |
|---|---|---|---|---|---|
| G-SKILL-SCAN | 目录扫描 SKILL.md | hermes | hermes-memory-delegate §3 Skills 系统 | scanner.ts | 不做 slash 命令展开 |
| G-SKILL-INJECT | skill 进 user prompt | hermes | AGENTS.md:381 prompt caching | buildPrompt 拼接 | 无 |
| G-SKILL-ASSIGN | 按 agent 分配 | seed.js | skillIds[] | agent_skill 表 | 无 |
| G-MCP-CONFIG | MCP JSON 配置 | claude-code | `--mcp-config` help | agent.mcpServers JSONB | 不做连接测试 |
| G-MCP-INJECT | MCP 注入 CLI | claude-code | `--mcp-config` argv | backend 写临时文件 | 无 |
| G-FOOTPRINT | 扩展哲学 | hermes | Footprint Ladder §3 | skill = 阶 2（CLI+skill）| 无 |

---

## 12. 风险

| 风险 | 缓解 |
|---|---|
| claude stdin 修复方向不确定 | S05 impl 第一步 spike，spawn-line.ts 支持 stdin 写入 |
| frontmatter 解析引入 yaml 依赖 | 简单行解析（只 name/description 两字段），不引依赖 |
| opencode/cursor 不支持 MCP | 降级忽略 mcpServers，不报错 |
| skill 目录不存在 | scanDir 判 existsSync，不存在静默跳过 |
| 临时 MCP 配置文件泄露 | executeRun finally 清理临时文件 |
| 内存索引与文件系统不同步 | "重新扫描"按钮 + 启动时扫描；执行时实时读内存（不查 DB）|

---

## 13. 自审记录

| 检查项 | 结果 |
|---|---|
| Placeholder | 无 TBD/TODO；claude stdin argv 允许 spike 钉死 |
| 内部一致 | K1-K7 与数据/API/注入/前端一致 |
| 范围 | Skill + MCP + stdin 修复，排除项清晰（§1.3）|
| 歧义 | skill 不进 DB（K4）、目录合并去重（K5）、MCP JSON 格式（§3.3）均消歧 |
| 与 S04 | buildPrompt 加 agentId；RunWorker 传 mcpServers；spawn-line 支持 stdin |
| Borrow | §11 完整，6 项均有锚点 |
| hermes 对齐 | skill 零足迹（文件系统真源 + 内存索引）；skill 进 user prompt（保 cache）|

### 自审修订 R1-R6（2026-07-15 deep review）

| ID | 问题 | 性质 | 修复 |
|---|---|---|---|
| R1 | agent_skill 悬空 skillId（skill 被删后分配关系指向不存在）UI 不一致 | 边界 case | §3.2 GET /api/agents/:id/skills 过滤 skillIndex 里不存在的 skillId |
| R2 | spawn-line stdin 支持是结构性改动（加 stdinInput 参数 + stdin 管理），非小改 | 标注缺失 | §8.2 标注结构性扩展 + 4 步改动说明 |
| R3 | MCP 临时文件 abort 后可能泄露（spawn-line 5s 兜底强制 finish 绕过正常清理） | 资源泄露 | §7.2 明确 execute 方法 try/finally 包临时文件清理 |
| R4 | 无 frontmatter 的 SKILL.md 解析行为未定义 | 边界 case | §5.1 降级：用文件名作 name，全文作 body |
| R5 | scanSkills 项目级路径 join(cwd, '.skills') 可能误读 server 进程 cwd | 路径 bug | §5.1 改 path.resolve(cwd, '.skills') + cwd 长度检查 |
| R6 | S01 的 skill 表变死表（S05 改文件系统真源后不用） | 死表清理 | §3.2b migration 0004 DROP TABLE skill + 删 seed |
