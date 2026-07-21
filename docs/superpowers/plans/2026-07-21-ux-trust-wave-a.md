# UX Trust Wave A — 派活诚实 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.  
> **本仓工程：** Slice Owner · main 直推（见 `AGENTS.md` / ADR 0001）· 关刀 Playwright + `app/.progress/*-impl-1.md`。

**Goal:** 消灭「跑绿了仓库没动」——建 Issue 可选 project、无/坏 path 预检可见；run 可审计 cwd mode+path；EnvBanner/QC 文案与默认隔离一致。

**Architecture:** 后端 cwd 解析已在 `resolve-run-cwd.ts`（project_local → workspace opt-in → isolated）。本波次以前端诚实 + run 落库展示 + 文案/闸对齐为主，不改 Multica daemon 模型。

**Tech Stack:** TypeScript monorepo（`@ma/shared` + Fastify server + Next.js web）、React Query、Drizzle/SQLite、Playwright-cli 手测。

**Phase 真源：** `app/.progress/phase-multica-ux-trust-2026-07-21.md`  
**默认队列：** A1 → A2 → A3（然后 Wave B/C 另开计划或续本文件）。

---

## File map

| 文件 | 责任 |
|---|---|
| `app/packages/web/components/NewIssueForm.tsx` | A1：项目选择、`?project=` 预填、cwd/隔离预检条、submit `projectId` |
| `app/packages/web/app/globals.css` | A1：`.new-issue-cwd-banner` 变体（info / warn / ok） |
| `app/packages/web/components/KanbanBoard.tsx` | A1（可选）：把 `projectFromUrl` 当 default 传给表单（表单也可自读 URL） |
| `app/packages/server/src/db/schema.ts` + migration | A2：`agent_run` 增加 `cwd_path` / `cwd_mode`（若尚未有） |
| `app/packages/server/src/orchestration/run-worker.ts` | A2：spawn 前写 cwd 字段 |
| `app/packages/shared/src/schema.ts` | A2：AgentRun 类型暴露 cwd |
| `app/packages/web/components/RunDetailPage.tsx` 等 | A2：展示 mode 中文 + path |
| `app/packages/web/components/EnvBanner.tsx` / Settings / QC | A3：默认隔离文案；QC 硬闸 |
| `app/.progress/ux-trust-aN-*-impl-1.md` | 每刀关刀证据 |
| `app/.progress/phase-multica-ux-trust-2026-07-21.md` | 进度表勾选 |

### 已有能力（勿重复造）

- `CreateIssueInput.projectId` 已支持（ProjectDetail 已传）
- `Project.localPath` + `localPathExists` 已在 API
- `resolveRunCwd`：project_local / workspace / isolated_*
- `NewIssueForm` 已有 assignee readiness + 工作区 opt-in 硬闸 banner（`MA_ISSUE_USE_WORKSPACE_CWD`）

---

### Task 1: A1 — 新建 Issue 绑项目 + cwd 预检

**Files:**
- Modify: `app/packages/web/components/NewIssueForm.tsx`
- Modify: `app/packages/web/app/globals.css`（banner 变体）
- Optional: `app/packages/web/components/KanbanBoard.tsx`（传 prop，非必须）
- Progress: `app/.progress/ux-trust-a1-new-issue-project-impl-1.md`

- [x] **Step 1: 扩展 NewIssueForm 状态与数据**

在现有 imports 增加 `useProjects`；增加 `projectId` state；从 URL `?project=` 预填（与 `?new=1` 同 pattern，**不**从 URL 删除 `project`——那是看板筛选）。

```tsx
import {
  useAgents,
  useAgentsReadinessMap,
  useCreateIssue,
  useProjects,
  useSettingsStatus,
  useSquads,
} from '@/lib/api';

// inside component:
const { data: projects = [] } = useProjects();
const [projectId, setProjectId] = useState('');

// 看板 ?project= 预填（仅当表单打开或 URL 变化时同步一次）
const projectFromUrl = searchParams.get('project') ?? '';
useEffect(() => {
  if (projectFromUrl) setProjectId(projectFromUrl);
}, [projectFromUrl]);
```

- [x] **Step 2: 计算执行目录预检（纯前端，基于 projects 列表）**

```tsx
type ExecPreview =
  | { kind: 'isolated'; reason: 'no_project' | 'no_path' }
  | { kind: 'project_local'; path: string }
  | { kind: 'invalid_path'; path: string };

const selectedProject = useMemo(
  () => projects.find((p) => p.id === projectId) ?? null,
  [projects, projectId],
);

const execPreview: ExecPreview = useMemo(() => {
  if (!selectedProject) return { kind: 'isolated', reason: 'no_project' };
  const path = selectedProject.localPath?.trim() || '';
  if (!path) return { kind: 'isolated', reason: 'no_path' };
  if (selectedProject.localPathExists === false) {
    return { kind: 'invalid_path', path };
  }
  return { kind: 'project_local', path };
}, [selectedProject]);
```

文案（中文 UX）：

| kind | data-mode | 文案要点 |
|---|---|---|
| isolated / no_project | `isolated` | **将在隔离目录执行** — 未关联项目；不会改动业务仓。绑定项目并配置本机目录后，才在真仓跑。 |
| isolated / no_path | `isolated` | **将在隔离目录执行** — 项目「{title}」未绑定本机目录。→ 链到 `/projects/{id}` |
| invalid_path | `invalid` | **项目路径无效** — `{path}` 不存在或不是目录；指派后 run 会失败。→ 链到项目详情改路径 |
| project_local | `project_local` | **将在项目本机目录执行** — `{path}` |

与现有 `showCwdWarn`（工作区 opt-in）并存：两者可同时显示；`project_local` 时仍保留 assignee 闸。

- [x] **Step 3: UI — 项目 select + 预检 banner + submit**

在 priority select 后、assignee select 前插入：

```tsx
<select
  className="new-issue-select new-issue-project"
  value={projectId}
  onChange={(e) => setProjectId(e.target.value)}
  aria-label="所属项目"
  data-testid="new-issue-project"
>
  <option value="">无项目（隔离执行）</option>
  {projects.map((p) => {
    const pathHint = p.localPath
      ? p.localPathExists
        ? ' · 已绑目录'
        : ' · 路径无效'
      : ' · 未绑目录';
    return (
      <option key={p.id} value={p.id}>
        {p.title}
        {pathHint}
      </option>
    );
  })}
</select>
```

预检 banner（在 form 顶部、cwd opt-in banner 之后或合并区域）：

```tsx
<div
  className={
    'new-issue-exec-banner' +
    (execPreview.kind === 'invalid_path'
      ? ' is-bad'
      : execPreview.kind === 'project_local'
        ? ' is-ok'
        : ' is-warn')
  }
  data-testid="new-issue-exec-banner"
  data-mode={
    execPreview.kind === 'project_local'
      ? 'project_local'
      : execPreview.kind === 'invalid_path'
        ? 'invalid'
        : 'isolated'
  }
  role="status"
>
  {/* 文案见上表 */}
</div>
```

`submit`：

```tsx
create.mutate(
  {
    title: title.trim(),
    priority,
    assignee,
    projectId: projectId || undefined,
  },
  {
    onSuccess: () => {
      // reset 时：title/priority/assignee 清空；projectId 若来自 URL 可保留
      setTitle('');
      setPriority('none');
      setAssigneeValue('');
      if (!projectFromUrl) setProjectId('');
      setOpen(false);
    },
  },
);
```

`reset` 同步：无 URL project 时清空 `projectId`。

- [x] **Step 4: CSS 变体**

在 `globals.css` 的 `.new-issue-assignee-banner` 附近：

```css
.new-issue-exec-banner {
  flex: 1 1 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
}
.new-issue-exec-banner.is-warn {
  border: 1px solid color-mix(in srgb, var(--color-orange, #f97316) 45%, transparent);
  background: color-mix(in srgb, var(--color-orange, #f97316) 10%, transparent);
}
.new-issue-exec-banner.is-bad {
  border: 1px solid color-mix(in srgb, var(--color-red, #ef4444) 50%, transparent);
  background: color-mix(in srgb, var(--color-red, #ef4444) 12%, transparent);
}
.new-issue-exec-banner.is-ok {
  border: 1px solid color-mix(in srgb, var(--color-green, #22c55e) 40%, transparent);
  background: color-mix(in srgb, var(--color-green, #22c55e) 10%, transparent);
}
.new-issue-exec-banner strong {
  margin-right: 6px;
}
```

- [x] **Step 5: typecheck**

```bash
cd app ; pnpm exec tsc --noEmit -p packages/web
```

Expected: 0 errors.

- [x] **Step 6: Playwright 手测（dev 已起则直接开）**

```bash
# 若未起：app 下 pnpm dev（:3000 + API）
playwright-cli open http://localhost:3000/
playwright-cli snapshot
# 点「新建 Issue」
# 断言 data-testid=new-issue-exec-banner data-mode=isolated 含「隔离」
# 选有 localPath 的项目 → data-mode=project_local
# 选无 path 项目 → isolated + 链到项目
# 有 ?project= 打开 /?project=<id> → 预填 select
# 提交后 issue 详情 project 字段正确（IssueHeader）
```

- [x] **Step 7: 关刀 + commit**

写 `app/.progress/ux-trust-a1-new-issue-project-impl-1.md`；更新 phase 进度表 A1 ✅；更新 `CONTEXT.md` 方位一行。

```bash
git add app/packages/web/components/NewIssueForm.tsx app/packages/web/app/globals.css \
  app/.progress/ux-trust-a1-new-issue-project-impl-1.md \
  app/.progress/phase-multica-ux-trust-2026-07-21.md CONTEXT.md
git commit -m "$(cat <<'EOF'
feat: bind project on new issue with cwd preview

Show isolation vs project-local path before create so users know
where the agent will run; prefill from board ?project= filter.
EOF
)"
git push origin main
```

**A1 验收（Must）：**
1. 看板新建可选项目并提交 `projectId`
2. 无项目 / 无 path → 隔离提示可见
3. 无效 path → 红条可见且链到项目
4. 有效 path → 展示将执行目录
5. `?project=` 预填
6. Playwright 证据写入 progress

**A1 非目标：** run 落库 cwd（A2）、Chat 绑仓（B1）、改 resolve-run-cwd 优先级。

---

### Task 2: A2 — Run 落库 cwd + UI 展示

**Files:**
- Inspect first: `app/packages/server/src/db/schema.ts`（`agent_runs` 是否已有 cwd 列）
- Create migration if needed: `app/packages/server/drizzle/00xx_run_cwd.sql`
- Modify: `run-worker.ts`（resolve 后写入）
- Modify: shared `AgentRun` / reshape
- Modify: `RunDetailPage.tsx`、`IssueRunHistory.tsx` 或 `RunsPage` 一行展示
- Progress: `app/.progress/ux-trust-a2-run-cwd-display-impl-1.md`

- [x] **Step 1: 调研现有列**

```bash
rg "cwdPath|cwd_path|cwdMode|cwd_mode" app/packages/server app/packages/shared
```

若已有字段则只做 UI；若无：

```sql
ALTER TABLE agent_run ADD COLUMN cwd_path text;
ALTER TABLE agent_run ADD COLUMN cwd_mode text;
```

- [x] **Step 2: worker 写入**

在 `run-worker.ts` 已有 `resolveRunCwd` 调用处，将 `resolved.path` / `resolved.mode` 写入 run 行（spawn 前或成功创建隔离目录后）。

- [x] **Step 3: API reshape + 前端**

中文 mode 标签：

| mode | 标签 |
|---|---|
| project_local | 项目本机 |
| workspace | 工作区 |
| isolated_issue / isolated_run | 隔离 |
| chat_scratch | 聊天隔离 |
| none | 未就绪 |

UI：`data-testid="run-cwd"` 显示 `标签 · path`。

- [x] **Step 4: typecheck + Playwright**

打开任意 run 详情 / issue 活迹，确认可见。

- [x] **Step 5: commit + push main**

```bash
git commit -m "feat: persist and display agent run cwd mode and path"
git push origin main
```

**A2 非目标：** Chat 绑 project（B1）、path mutex（C1）。

---

### Task 3: A3 — 文案与 QC 闸对齐

**Files:**
- Modify: `EnvBanner.tsx`、`SettingsPage.tsx`（相关 check 文案）
- Modify: `QuickDispatchPanel.tsx` + server `quick-runs` / enqueue readiness
- Progress: `app/.progress/ux-trust-a3-copy-qc-gate-impl-1.md`

- [x] **Step 1: 文案审计**

搜索 UI 中「必须配置 MA_WORKSPACE_CWD 才能开工」类误导句；改为：

- 默认：隔离目录可开工
- 仅 `MA_ISSUE_USE_WORKSPACE_CWD=1` 时 cwd 硬闸
- 有 project.localPath 时以项目路径为准

- [x] **Step 2: QC 与 Issue 同级 readiness**

确认 `quick-runs` 路由在 runtime_missing / cwd_missing（opt-in）时 **skipped 或 4xx**，不静默 queued。UI 展示 skip 原因。

- [x] **Step 3: Playwright + commit**

```bash
git commit -m "fix: align EnvBanner and QC gate with default isolation"
git push origin main
```

**Wave A 出口：** 用户能回答「这次 run 在哪」；看板新建不会默默空跑却以为改了业务仓。 **✅ 2026-07-21**

---

## Self-review

| Spec 项（phase DoD Wave A） | 任务 |
|---|---|
| 看板新建可关联 project；无/坏 path 预检 | Task 1 |
| issue run UI 可见 cwd mode + path | Task 2 |
| EnvBanner/Settings/QC 与默认隔离一致 | Task 3 |

Placeholder scan: 无 TBD。类型名与现有 `Project.localPath` / `resolveRunCwd.mode` 一致。

---

## Execution

人已授权：**写计划后 Slice Owner 驱动**；本仓 **main 直推**。

推荐本会话：**Inline 执行 Task 1（A1）**，A2/A3 同会话或续窗按 progress 交接。

**下一刀（A1 后）：** A2 run cwd 落库 + UI。
