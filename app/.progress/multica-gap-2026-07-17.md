# Multica 对照差距表 · 2026-07-17（续）

> HEAD：`d3d4211` 起 + 本刀 runs-squad-filter  
> 目标：日常可用纯本地编排控制台，体验对标 Multica，不抄云托管。

## 本会话后新增对齐

| 路径 | 状态 | Commit/刀 |
|---|---|---|
| 在途 run 全局可见 | ✅ | runs-active-nav / chip / cmdk |
| Issue 多 run 回放 | ✅ | issue-run-history |
| 自动化 next/模板/失败计数 | ✅ | next-run / preview / edit / fail-counts |
| Inbox 失败双入口 | ✅ | inbox-dual-deeplink |
| cwd 首跑防护 | ✅ | qc/issue gate + settings guide |
| 小队 run 时间线 + Runs 筛选 | ✅ | squad-runs-timeline / runs-squad-filter |
| mention / 指派导航 | ✅ | mention-nav / issue-assignee-nav |
| Issue/看板来源可见与筛选 | ✅ | origin-badge / board+cmdk origin / automation 回链 |
| 筛选可清除芯片（板/Runs/Inbox） | ✅ | board/runs/inbox filter chips |
| 指派/名单回链看板 | ✅ | assignee/roster/cmdk board links |
| 记忆 kind URL 筛选 | ✅ | memory-kind-filter + cmdk |
| 操作成功 toast 深链 | ✅ | qc/ops/retry toast nav |
| WS 终态 toast 深链 | ✅ | live-run-toast |
| 侧栏 Wiki dead 角标 | ✅ | sidebar-wiki-dead-badge |
| Settings Wiki LLM 引导 | ✅ | settings-wiki-llm-guide |
| 运行时运营入口 | ✅ | runtimes-ops-links |
| Skills usedBy / 空态 | ✅ | skills-ops-links |
| 标签 → 看板筛选 | ✅ | label-board-links |
| Agents 列表可分享筛选 | ✅ | agents-list-filters |
| Squads 列表可分享筛选 | ✅ | squads-list-filters |
| Automation 规则筛选 | ✅ | automation-rule-filters |
| 失败恢复引导（Runs/看板） | ✅ | fail-recovery-cues |
| Inbox 失败再执行 | ✅ | inbox-fail-retry |
| Settings cwd/wiki/runtime 回跳 | ✅ | settings-cwd/wiki/ops-recovery |
| CmdK 运营恢复 | ✅ | cmdk-ops-recovery |
| Inbox 批量已读 | ✅ | inbox-bulk-read |
| Agent/小队详情恢复链 | ✅ | agent/squad-readiness-recovery |
| Issue 失败条运营闭环 | ✅ | issue-fail-recovery-links |
| 侧栏失败芯片 | ✅ | sidebar-fail-chip |
| 指派就绪恢复链 | ✅ | assignee-recovery-links |
| 派活/建 Issue cwd 恢复链 | ✅ | dispatch-cwd-recovery |
| Runtimes ↔ agents/runs | ✅ | runtimes-recovery-links |
| 优先级/来源深链 + pills/CmdK | ✅ | board-meta-deeplinks / board-priority-ops |
| 看板状态列聚焦 | ✅ | board-status-focus |
| 详情状态 → 看板聚焦 | ✅ | issue-status-board-link |
| 运行表/Agent Runs 行内筛选 | ✅ | runs-table-deeplinks / agent-runs-deeplinks |
| Skills URL 筛选 | ✅ | skills-url-filters |
| 自动化规则行运营链 | ✅ | automation-row-links |
| 小队/Wiki 任务深链 | ✅ | squad-wiki-run-links |
| Mention 看板/运行链 | ✅ | mention-ops-links |
| Memory/Wiki 运营回跳与列表搜索 | ✅ | memory-ops-links / wiki-ops-links |
| Inbox 类型 chip 筛选 | ✅ | inbox-kind-ops |
| Wiki 健康 / RunTrace 恢复 | ✅ | wiki-health-run-trace-ops |
| Issue 运行历史运营深链 | ✅ | issue-run-history-links |
| 全局环境横幅分级恢复 | ✅ | env-banner-ops |
| 快速派活指派就绪恢复 | ✅ | qc-assignee-readiness |
| 新建 Issue 指派就绪恢复 | ✅ | new-issue-assignee-readiness |
| Inbox 服务端 bulk 已读/归档 | ✅ | inbox-bulk-api |
| Agents 批量 readiness | ✅ | agents-readiness-bulk |
| 卡死 run 收尸（queued/orphan） | ✅ | runs-recover-stuck |
| 在途 run 批量取消 | ✅ | runs-bulk-cancel |
| Settings 运行健康 / 心跳阈值可见 | ✅ | settings-run-health |
| Settings Wiki/自动化健康摘要 | ✅ | settings-wiki-auto-health |
| 工作区 cwd 持久化（Settings 可配） | ✅ | workspace-cwd-persist · ADR 0003 |
	
## 仍弱（非完成态原因）
	
| 缺口 | 说明 |
|---|---|
| Wiki LLM / embedding 密钥仍 env | 刻意不写密钥到 DB/UI |
| webhook / 云事件 | 宪法不做 |
| 与 Multica daemon 协议 1:1 | Backend adapter 差异保留 |
| Multica `waiting_local_directory` 路径锁 | 本仓单 cwd 足够日常 |
| 大规模生产运营报表 | 非本阶段 |
	
## 达标判断
	
**主航道日常可用：是。**  
**宣称「Multica 本地魔改完成态」：有条件接近** — 派活/追踪/恢复/健康/cwd 持久化已闭环；密钥与 daemon 协议差异为刻意边界，非未做完的主航道债。
	
继续策略：缺口驱动的短/厚切片 + 本表滚动更新；人可判定是否收官。
