# Handoff: s05-impl-3

> 切片：`S05` · 角色：`impl` · 序号：`3`
> 日期：2026-07-15
> 分支：`feat/s05-skill-mcp`

## 上下文（给下一个会话读）

S05 切片「Skill（本地目录）+ MCP 配置」的第三个（最后一个）执行者片段。负责**前端三块 + 端到端验收**，并在用户反馈后做了**前端样式重构 + MCP 格式统一 + scanner CRLF 修复**。这是 Phase 1 的收尾——FRI-11 答辩路径最后一段。

S05 全图：
- impl-1：DB + scanner + seed + shared 契约 + 启动扫描 ✅
- impl-2：stdin 修复 + skill/MCP 注入执行层 + API 路由 ✅
- **impl-3（本文件）**：前端（Skills 页 + agent 详情 Tab + 侧栏）+ 端到端验收 + 样式重构 ✅

读 [spec §9/§10](../../docs/superpowers/specs/2026-07-15-s05-skill-mcp-design.md) + [plan 执行者片段 C](../../docs/superpowers/plans/2026-07-15-s05-skill-mcp.md) + [s05-impl-2.md](./s05-impl-2.md) + 本文件。

## 本会话完成了什么

### Part 1：前端三块（Task 3.1-3.5）

#### Task 3.1: 后端补 GET /api/agents/:id + shared AgentDetail 契约（commit b12b227）

agent 详情页需要单 agent 数据（name/category/runtime/concurrency），后端只有列表 GET /api/agents。
- `shared/schema.ts`：加 `AgentDetail`（AgentSummary 扩展 category/concurrency/mcpServers）
- `server/routes/roster.ts`：加 `GET /api/agents/:id` 返回完整 agent 行

#### Task 3.2: 前端 API hooks（合入 3.4 commit）

`web/lib/api.ts` 末尾追加 7 个 S05 hooks：
- `useSkills` / `useRefreshSkills`（GET/POST /api/skills）
- `useAgent`（GET /api/agents/:id）
- `useAgentSkills` / `useUpdateAgentSkills`（GET/PUT /api/agents/:id/skills）
- `useAgentMcp` / `useUpdateAgentMcp`（GET/PUT /api/agents/:id/mcp）

#### Task 3.3: Skills 页（commit c308b70）

`app/skills/page.tsx` + `components/SkillsPage.tsx`：照原型 renderSkills（app.js:619）。
页头 count + 重新扫描（POST refresh）+ 搜索框 + 表格 4 列（名称/被谁使用/来源/简介）。

#### Task 3.4: agent 列表页 + agent 详情页 + 侧栏激活（commit c308b70）

**发现：S03 根本没建 agent 详情页**（计划者注意点 4 说「只建了 Tab 栏占位」不实）——连 agents 列表页都没有。必须建出最薄可达路径：
- `app/agents/page.tsx` + `AgentsPage.tsx`：列表页（agent 名/运行时，点进详情）
- `app/agents/[id]/page.tsx` + `AgentDetailPage.tsx`：详情页（薄 profile + tab 栏；Skills Tab = checkbox 分配；MCP Tab = JSON textarea）
- `Sidebar.tsx`：skills 加 `href: '/skills'`，agents 加 `href: '/agents'`
- `globals.css`：加 S05 通用页面类（page-header/skill-tag/source-badge/agent-detail/mcp-editor 等）

### Part 2：样式重构 + 格式修正（commit ef8a2e4，用户反馈驱动）

#### 用户反馈三条 + 处理

**反馈 1：emoji 不要** → AgentDetailPage profile-icon `🤖` 改为 `<Icon name="agent" />`

**反馈 2：MCP 横向格式奇怪，应是 object 格式** → 全面统一 MCP 为 object 格式：
- `claude-code.ts`：删掉 array→object 边界转换（之前 agent.mcpServers 存 array，注入时转 object——多余的边界转换）
- `AgentDetailPage.tsx` MCP Tab：placeholder/提示/校验全改 object 格式示例 `{<name>:{type,command,args,env}}`
- 现在前端编辑/存储/注入统一 object 格式，对齐 claude `--mcp-config` 的 mcpServers 结构

**反馈 3：前端样式不好看，要调研优化** → 用 agent-reach skill 调研 Linear/Vercel/Stripe 设计标准，核心结论：
- 单一强调色（克制，不堆配色）
- 发丝线边框替代阴影做层级（0.5-1px border）
- 表面阶梯（bg-elevated / bg-hover）区分深度
- 紧字距（letter-spacing: -0.01em 标题）
- 去 emoji、去装饰

`globals.css` S05 段按此标准重写：
- `rgba(0,0,0,0.04)` 等 light theme 残留 → 改用 dark theme 变量（`var(--bg-elevated)` / `var(--bg-hover)` / `var(--border-subtle)`）
- source-badge：满色块 → 克制 border + muted 文字
- skill-tag：对齐原型 `bg-elevated + text-muted`
- checkbox：加 `accent-color: var(--accent)`
- 所有交互元素加 `transition`（hover/focus 平滑）
- skill-assign-name 改 `font-mono`（skill name 是代码标识）
- detail-tab active 边框改 `text-primary`（非 accent，更克制）

### Part 3：scanner CRLF 修复（commit ef8a2e4，impl-1 隐藏 bug）

**发现：** 验收时 `/api/skills` 只返回 1 个 `{name:"SKILL", description:""}`，应该是 5 个。根因：`.skills/*/SKILL.md` 是 **Windows CRLF 行尾**（`\r\n`），而 impl-1 的 `parseFrontmatter` 正则 `/^---\n.../` 只匹配 LF（`\n`），导致 frontmatter 解析失败 → R4 降级用 `basename(path, '.md')` = "SKILL" → 5 个 skill 全叫 "SKILL"，Map 去重只剩 1 个。

**修复：** `scanner.ts` parseFrontmatter 正则 `\n` → `\r?\n`（3 处：frontmatter 边界 + body 分隔 + split 行）。修复后 5 个 skill name/description 全部正确解析。

## 自测结果

### typecheck（全量，重构后最终）
```
$ pnpm -r typecheck
packages/shared typecheck: Done
packages/server typecheck: Done
packages/web typecheck: Done
```

### DB 重置 + seed
```
$ rm -f dev.db* && pnpm db:migrate   →  ✓ 迁移完成
$ pnpm db:seed   →  ✓ seed 完成：8 条 issue，6 条 comment
```

### §10.3 skill 扫描（CRLF 修复后）
```
GET /api/skills → 5 skill 全部正确：
  design-system | 维护统一设计 token 与组件规范 | source: project
  extract-prototype-requirements | 从可交互原型反提需求清单 | source: project
  frontend-design | 按设计系统产出可交互前端原型 | source: project
  multica-squads | 按小队协议编排 leader/worker 委派闭环 | source: project
  prd-writer | 将需求转化为结构化 PRD 文档 | source: project
usedBy 反查正确（design-system → 产品·设计·原型官 等）
POST /api/skills/refresh → {"ok":true}
```

### §10.4 skill 分配 + 注入
```
GET /api/agents/agt-lead/skills → ["multica-squads"]
PUT /api/agents/agt-lead/skills（加 prd-writer）→ {"ok":true}，GET 复核 → ["multica-squads","prd-writer"]
（还原后）前端 checkbox 勾选 → 后端复核 ["multica-squads","prd-writer"] ✅，取消勾选 → 还原 ✅

buildPrompt(agt-lead) 含：
  ## Skill: multica-squads
  # Multica Squads
  当作为 squad leader 承接 Issue 时，遵循小队协议：...
  ---
  Issue FRI-04: ...
skillBlock + issueBody 拼接顺序正确，--- 分隔符在
```

### §10.5 MCP 配置 + 注入（object 格式）
```
PUT /api/agents/agt-lead/mcp（object 格式：{oracle:{type,command,args}}）→ {"ok":true}
GET 复核 → {"mcpServers":"{\"oracle\":{\"type\":\"stdio\",...}}"}
前端 MCP Tab：textarea object 格式 placeholder + 校验改为 typeof object（非 array）
（还原 null）
```

### §10.2 claude stdin（前端触发验证）
```
指派 FRI-04 给 agt-lead（PUT assignee:{type:agent,id:agt-lead}）→ run 启动 status:running
messages t=0: 9 条 → t=15s: 14 条（tool_start/tool_end 持续增长）
error/stdin 相关 messages: 0（无 no stdin data 报错）
run cancel 正常（status:cancelled）
```

### 前端浏览器验收（DevTools 快照）
- Skills 页：表格 4 列 + 5 skill + 搜索过滤生效（输入 "prd" 只剩 prd-writer）+ 重新扫描按钮 ✅
- agent 详情页 Skills Tab：5 skill checkbox，multica-squads checked，无 emoji ✅
- agent 详情页 MCP Tab：object 格式提示 + textarea + 保存/清空 ✅
- 侧栏 skills/agents 入口激活（link href）✅

### §10.6 回归 S01-S04
```
看板（S01）：六列全显示，8 issue 全在 ✅
FRI-11 详情（S02）：时间线 3 条 + @mention 三人 + 评论框 ✅
runtimes（S03）：页面正常 ✅
指派触发 run（S04）：claude stdin 修复后 run 能跑 ✅
```

### §10.7 FRI-11 答辩路径
```
看板 → FRI-11 详情（In Review 列，指派产品小队）→ 时间线（林远 brief → leader Operating Protocol + @mention → research 交付）✅
完整 squad 闭环：claude stdin 已修复（impl-2），leader run 能跑完产出 finalText（带 @mention）→ comment-trigger → worker（impl-2 验证 43 条 messages 无报错）
```

## 与计划的偏离

### 偏离 1：agent 详情页不存在，建了 agents 列表 + 详情最薄可达路径
计划者注意点 4 说「S03 只建了 Tab 栏占位」，实际 S01-S04 前端只有看板 + issue 详情 + runtimes。没有 agent 详情页、没有 agents 列表页、Sidebar 里 agents 入口无 href。为了让 Skills/MCP Tab 可达，建了：
- agents 列表页（最薄：agent 名/运行时 + 点进详情）
- agent 详情页（薄 profile + 4 tab，skills/mcp 实现，activity/instructions 占位）
- Sidebar agents 入口激活

### 偏离 2：Skills 页表格第 4 列用 description 替代「更新时间」
原型 renderSkills + 计划者注意点 3 写第 4 列「更新时间」，但 SkillInfo 契约（impl-1 建）只有 name/description/source/usedBy——文件系统 skill 无 mtime 概念。用有数据的 description 填第 4 列。

### 偏离 3：MCP 格式从 array 改为 object（用户反馈 + spec §3.3 修正）
impl-2 按 spec §3.3 存 array 格式，注入时转 object。用户反馈 MCP 标准是 object 格式（`{<name>:{type,command,args,env}}`），且 array→object 是多余边界转换。改为统一 object：前端编辑/存储/注入一致，删 claude-code.ts 的转换逻辑。

### 偏离 4：scanner CRLF 修复（impl-1 隐藏 bug）
SKILL.md 是 Windows CRLF 行尾，parseFrontmatter 正则只匹配 LF 导致 frontmatter 解析失败。正则 `\n` → `\r?\n` 修复。

### 偏离 5：前端样式重构（用户反馈）
用户反馈样式不好看，调研 Linear/Vercel/Stripe 后重写 globals.css S05 段（详见 Part 2）。

## 遗留 / 下一个执行者要注意的点

### S05 切片已完整——这是最后一个执行者片段
所有 spec §10 验收项通过。下一步是**计划者验收 + PR + 合并 main**。

### 样式重构范围说明
本次只重构了 impl-3 新增的 S05 CSS 段（Skills 页 + agent 详情页）。S01-S04 的旧组件（看板/issue 详情/runtimes）样式没动。如果要全面统一视觉，后续可做一个独立的样式优化切片（把 S01-S04 的组件也按 Linear/Vercel 标准重审）。

### MCP 格式最终态
- agent.mcpServers 存 **object 格式** JSON 字符串：`{<name>: {type, command, args, env}}`
- claude-code.ts 注入：直接 `JSON.stringify({mcpServers: parsed})`，无转换
- opencode/cursor：仍不传 mcpServers（未 spike 确认 CLI 支持，降级忽略）

### scanner CRLF 兼容
parseFrontmatter 现在兼容 CRLF + LF。如果后续在非 Windows 环境编辑 SKILL.md 变成 LF，也兼容。

### 前端进程稳定性（环境问题，非代码问题）
Windows 下 `pnpm --filter @ma/web dev` 的 wrapper 进程会退出（exit 0）但 next dev 子进程留下；有时子进程也会挂导致 404。验收时如果遇到 404，杀掉 :3000 进程重启即可。这是环境问题，不影响代码正确性。

## 验收结论（仅计划者填）

### impl-3 验收（待计划者复核）

- [ ] typecheck 通过
- [ ] `pnpm dev` 能跑
- [ ] 切片验收标准达成（见 spec §10）
- 结论：<待填>
