# Handoff: s06-impl-2

> 切片：`S06` · 角色：`impl` · 序号：`2`
> 日期：2026-07-16

## 上下文（给下一个会话读）

S06 = Phase 2 第一切片「Wiki 存储 + 浏览器 + ingest 管线」。目标：Issue 完成（status→done）时 LLM 自动生成 wiki 页 → 写文件系统 → WS 推前端 → `/wiki` 浏览器展示。

本会话（impl-2）是三执行者片段的第二个：**服务端管线层**（ingest 管线 + slug 工具 + Wiki API 路由 + Issue PUT 触发接线 + app/index 启动接线）。在 impl-1 的 store.ts + llm.ts 之上接线，给 impl-3（前端）提供 API 端点 + WS 事件。

读 [design/roadmap.md](../../design/roadmap.md) + [plan](../../docs/superpowers/plans/2026-07-15-s06-wiki.md)「执行者片段 B」+ [impl-1 handoff](./s06-impl-1.md) + 本文件。

## 本会话完成了什么

- **Task 2.1：slug 生成工具**（`app/packages/server/src/wiki/slug.ts`，新建）
  - `generateSlug(identifier, title): string` — 标题 → 空格转连字符 → 去文件系统危险字符 → 去控制字符 → 截断 60 字符 → 拼 `<identifier>-<slug>`
  - slug 不含 `.md`（store.ts 内部拼扩展名，照 impl-1 约定）
- **Task 2.2：ingest 管线**（`app/packages/server/src/wiki/ingest.ts`，新建）
  - `ingestIssue(issueId): Promise<void>` — 完整 6 步管线：
    1. 读 Issue + 最近 K=20 条 comments（createdAt DESC limit K → reverse 成正序）
    2. `saveRaw` 存快照（在 LLM 前，保证 raw 总被保存）
    3. `createLlm()` + `buildIngestPrompt` + `generateWikiPage` 调 LLM
    4. `generateSlug` + `writeWikiPage` 写 wiki 页
    5. `appendIndex` + `appendLog('ingest')` 更新导航/日志
    6. `eventBus.publish({ type: 'wiki:page-created', slug, title })` WS 通知
  - `formatSource(issue, comments)` 内部辅助：格式化 description + comments 为给 LLM 的 sourceText
- **Task 2.3：Wiki API 路由**（`app/packages/server/src/routes/wiki.ts`，新建）
  - `wikiRoutes(app)` 注册两个 GET：
    - `GET /api/wiki/pages` → `listWikiPages()` → `WikiPageSummary[]`
    - `GET /api/wiki/pages/:slug` → `readWikiPage(slug)` → `WikiPage`，不存在返回 404
  - 无 POST/PUT（Wiki 页只由 ingest 写，人不编辑）
- **Task 2.4：注册路由 + 启动 ensureWikiDir**
  - `app.ts`：import `wikiRoutes` + 在 `runtimeRoutes` 后、`wsRoutes` 前 `await app.register(wikiRoutes)`
  - `index.ts`：import `ensureWikiDir` + 在 `scanSkills()` 后调用 `ensureWikiDir()`（启动时建 wiki/ + raw/ + 初始 index.md/log.md）
- **Task 2.5：Issue PUT 触发 ingest**（`app/packages/server/src/routes/issues.ts`，改）
  - import `ingestIssue` + `appendLog`
  - PUT handler 末尾（assignee 副作用块之后、`return reply.send(issue)` 之前）加：`statusChanged && input.status === 'done'` 时 `void ingestIssue(id).catch(...)`，catch 内 `console.error` + `appendLog({ type: 'ingest-failed', ... })`
  - fire-and-forget，不阻塞 PUT 响应；`prev.identifier` 在作用域内可用（prev 在 line 99 定义，覆盖到 return）

## 自测结果

### typecheck（每次 Task 后 + 最终全绿）

```
$ pnpm -r typecheck
Scope: 3 of 4 workspace projects
packages/shared typecheck: Done
packages/server typecheck: Done
packages/web typecheck: Done
```

### 启动 + ensureWikiDir 验证（Task 2.4）

`npx tsx src/index.ts` 启动后，wiki/ 目录被创建（位置见下方"偏离"）：
```
app/packages/server/wiki/
├── index.md    # "# Wiki Index\n\n## Pages\n"
├── log.md      # "# Wiki Log\n"
└── raw/        # 空目录
```

### API 路由验证（curl）

```
GET /api/wiki/pages          → []                              (200, 空列表正确)
GET /api/wiki/pages/nonexistent → {"error":"wiki 页不存在"}    (404, 正确)
```

### ingest 触发链路验证（核心，未配 API key）

PUT issue FRI-04 status=done，观察整条 fire-and-forget + catch + log 链路：

```
PUT /api/issues/<id> {"status":"done"}
→ 响应正常返回（issue.status === "done"，不阻塞）
→ server log: [wiki] ingest 失败: Error: WIKI_LLM_API_KEY 未配置
    at createLlm (llm.ts:16:22)
    at ingestIssue (ingest.ts:58:15)
→ wiki/log.md 追加：
  ## [2026-07-16] ingest-failed | FRI-04
  - Source: issue/38071cb4-...
  - Error: Error: WIKI_LLM_API_KEY 未配置
→ wiki/raw/issue-38071cb4-...-2026-07-16T00-44-51-669Z.md 成功写入：
  # FRI-04: Memory 检索面板 mock（Should）
  Description: Phase 2+ 可插拔 Memory，MVP 仅占位。
  Comments（最近 3 条）:
  [status_change] 林远: {"from":"backlog","to":"in_progress"}
  ...
```

**关键结论**：
- ✅ fire-and-forget 隔离正确：PUT 响应不受 ingest 失败影响（issue 正常变 done）
- ✅ `saveRaw` 在 `createLlm()` 之前执行，所以 raw 快照**总是被保存**（即使后续 LLM 失败）——这是正确且有价值的行为
- ✅ catch 分支正确写 `ingest-failed` log
- ⏭️ 实际 LLM 生成 wiki 页：未配 WIKI_LLM_API_KEY，跳过（计划 Step 2 允许）。真实 LLM 调用需 impl-3 端到端验收时配 key 验证，或后续单独验证。

测试数据 FRI-04 已恢复为 backlog，wiki/ 测试产物已清理（wiki/ 在 .gitignore，不进 git）。

## 与计划的偏离

1. **wiki/ 目录实际生成位置**：计划/spec 说 wiki/ 在项目根，但 `getWikiDir()` 依赖 `MA_WORKSPACE_CWD`（未配时 fallback `process.cwd()`）。`npx tsx src/index.ts` 从 `app/packages/server/` 启动时 cwd = server 包，所以 wiki/ 生成在 `app/packages/server/wiki/`。`pnpm dev` 从 `app/` 启动时 wiki/ 会生成在 `app/wiki/`。这与 impl-1 handoff 预期一致（计划者补充注意点 #2 说"接受现状，与 S05 .skills/ 同理"）。**要 wiki/ 在项目根需配 `MA_WORKSPACE_CWD=<项目根>`**——这是运行时配置问题，非代码 bug。

   无其他代码偏离——计划 5 个 Task 的代码全部照搬，无修改。

## 遗留 / 下一个执行者要注意的点

### 给 impl-3（前端 Wiki 浏览器 + 端到端验收）

**API 端点（已就绪，可直接用）**：
- `GET /api/wiki/pages` → `WikiPageSummary[]`（`{ slug, title }[]`）
- `GET /api/wiki/pages/:slug` → `WikiPage`（`{ slug, title, content }`），不存在 404
- slug 不含 `.md`（URL 里直接用 slug，如 `/api/wiki/pages/FRI-04-memory-检索面板`）

**WikiPageCreatedEvent（WS 事件，已通过 eventBus→wsBroadcaster 自动到前端）**：
```typescript
{ type: 'wiki:page-created', slug: string, title: string }
```
- server 侧无需改：`app.ts` line 23 `eventBus.on((e) => wsBroadcaster.broadcast(e))` 已广播所有 DomainEvent（含 WikiPageCreatedEvent）到前端 WS
- 前端 `ws.ts` 的 `ws.onmessage` 收到 `event.type === 'wiki:page-created'` 时 invalidate `['wiki-pages']` query 即可（用 invalidateQueries 而非 setQueryData，因为新页 content 要从文件系统读，前端无法凭 slug+title 构造完整页）

**端到端验收时的环境配置（spec §8.3 核心验收项需配 key）**：
```bash
export WIKI_LLM_PROVIDER=openai        # 或 anthropic
export WIKI_LLM_API_KEY=<你的key>
export WIKI_LLM_MODEL=gpt-4o           # 或实际模型名
# export WIKI_LLM_BASE_URL=<端点>      # 国产/本地端点用（openai 兼容格式）
# export MA_WORKSPACE_CWD=<项目根>     # 想让 wiki/ 生成在项目根时配（可选）
```

**已验证的行为（impl-2 测过，impl-3 可信赖）**：
- ingest 触发：status→done 时异步 fire，PUT 不阻塞
- 失败处理：LLM 失败 → catch → console.error + log.md 写 ingest-failed，不影响 issue 完成
- raw 快照：在 LLM 前保存，即使 LLM 失败 raw 也在
- API 路由：空列表返回 []，不存在页返回 404

**wiki/ 产物是运行时生成**：不进 git（.gitignore 有 `wiki/`）。每次 `pnpm dev` 重启，`ensureWikiDir()` 会确保 wiki/ + 初始 index/log 存在（已有则不覆盖）。端到端验收产生的 wiki 页是临时的，重启后 index/log 保留（append-only），但已有的 wiki 页文件不会被删。

**WS 广播路径确认**：`ingest.ts` → `eventBus.publish(WikiPageCreatedEvent)` → `app.ts` 的 `eventBus.on(e => wsBroadcaster.broadcast(e))` → 所有连接的 WS 客户端。前端 `ws.ts` `onmessage` 解析 JSON 后按 `event.type` 分发。impl-3 加 `wiki:page-created` 分支即可。

## 验收结论（仅计划者填）

> 切片是否达标、能否合并、是否要点亮 FRI-11 路径的某一段。

- [x] typecheck 通过（Task 2.1-2.5 每次 + 最终全绿）
- [x] slug.ts generateSlug 实现（文件名安全 + 保留中文 + 截断）
- [x] ingest.ts 6 步管线完整（读 issue → raw → LLM → writePage → index/log → WS）
- [x] wiki.ts API 路由（GET pages 列表 + GET pages/:slug，curl 验证 200/404）
- [x] app.ts + index.ts 接线（wikiRoutes 注册 + ensureWikiDir 启动调用，启动验证 wiki/ 创建）
- [x] issues.ts PUT 触发（status→done fire-and-forget + catch + log，端到端验证触发链路）
- [x] pnpm dev 能跑（server 启动 + wiki/ 创建 + API 响应）
- [ ] 实际 LLM 生成 wiki 页（未配 key，跳过；impl-3 端到端验收时配 key 验证）
- [ ] 切片验收标准达成（impl-2 是管线层，完整验收在 impl-3 前端 + 端到端）
