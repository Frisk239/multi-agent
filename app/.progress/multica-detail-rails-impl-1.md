# Closeout: multica-detail-rails（G26/G23/G24/G27/G25）

日期：2026-07-21  
分支：`main` @ `3603bd1`（本仓授权 main 直推）  
远程：`git push origin main` **失败**（`github.com:443 via 127.0.0.1` 代理连不上）— 本地 **ahead 1**，需网络恢复后重推

## 交付

| ID | 内容 | 落地 |
|---|---|---|
| **G26** | Issue 详情属性右栏 | `IssueDetail` 双栏布局 + `IssueHeader` variant=`main`/`props`；收件箱嵌入同构 |
| **G23** | 运行事件时间线弹层 | `RunEventTimeline.tsx` 色条事件 + 抽屉；Issue 执行日志 / Runs「时间线」入口 |
| **G24** | 独立「我的 issue」页 + Tab | `/my-issues` + 全部/已分配/我创建的/我的智能体和小队；侧栏改链 |
| **G27** | 收件箱 Helper 第三栏 | `inbox-split--tri` + `HelperRail variant=docked`；Inbox 页隐藏全局 FAB |
| **G25** | 智能体 已归档/我的·全部 | `agent.archived_at` 迁移；`GET ?archived=`；软归档 DELETE；Tab UI |

## 证据

### typecheck
```
pnpm --filter @ma/shared typecheck  # ok
pnpm --filter @ma/server typecheck  # ok
pnpm --filter @ma/web typecheck     # ok
```

### 迁移
- `0022_agent_archived.sql` 已 `db:migrate` ✓

### Playwright（本仓 localhost:3000 + API 3001）
| 路径 | 断言 |
|---|---|
| `/my-issues` | `data-testid=my-issues-page`；Tab 切换 `scope=all` → 64 行列表 |
| `/inbox` | `inbox-split--tri` + `helper-rail-docked`；无 FAB |
| `/inbox?issue=…` | `issue-props-rail` + `helper-rail-docked` + `issue-detail` |
| `/issues/:id` | `issue-detail-layout` + 属性栏「状态/负责人/项目/PR/标签」 |
| `/agents` | `agents-scope-tabs` 我的/全部/已归档 + 行「归档」按钮 |
| `/runs?status=all` | 79× `runs-open-timeline`；点击 → `run-event-drawer`（meta/stats） |

### Multica 真站对照（storage-state）
- `/my-issues`：Tab 文案 全部/已分配/我创建的/我的智能体和小队 — 本仓同构
- `/agents`：我的/全部/已归档 — 本仓同构（本地单用户「我的」≈活跃全集）
- Inbox Helper 第三栏 — 本仓 docked；真站 FloatingChat 同屏语义

## 偏离 / 债

1. **G23 事件密度**依赖 runtime 写入的 `run_message`；opencode 无实时轨迹时抽屉可为空（文案诚实）
2. **G24「已分配」**按 `assignee=member:user-linyuan`；本地 seed 多指派 agent，默认 Tab 常空，用「全部」看 agent/squad 相关
3. **G25「我的」**无多 Owner；等同活跃列表（与真站多 Owner 列简化）
4. 工作区仍含**前序未提交** parity 改动（G21/G22/chat/UI），与本刀一并 commit
5. 勿 commit `wiki/`、`*.db`、`multica-auth/storage-state.json`

## 给下一 Owner

- 验收：`/my-issues` · `/inbox` 三栏 · Issue 右栏 · Runs 时间线 · Agents 归档 Tab
- 建议下一刀：G28 看板卡片密度 / 列表视图，或 G23 opencode 流解析加固
