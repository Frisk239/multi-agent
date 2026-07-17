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

## 仍弱（非完成态原因）

| 缺口 | 说明 |
|---|---|
| 首次 cwd 仍依赖人 export env | 有引导，但无系统级持久配置 UI（刻意不写密钥/磁盘） |
| webhook / 云事件 | 宪法不做 |
| 与 Multica daemon 协议 1:1 | Backend adapter 差异保留 |
| 大规模生产运营报表 | 非本阶段 |

## 达标判断

**主航道日常可用：是。**  
**宣称「Multica 本地魔改完成态」：否** — 边界能力与运营纵深仍可演进，但已具备对标本地控制台的可天天用闭环。

继续策略：缺口驱动的短/厚切片 + 本表滚动更新。
