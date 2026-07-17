# Multica 对照差距表 · 2026-07-17

> 目标：日常可用的**纯本地**编排控制台，体验对标 Multica，不抄云托管。  
> HEAD：`ff6a0d3`（与 `origin/main` 同步）

## 已对齐（日常可用主路径）

| 用户路径 | 本仓状态 | 关键证据 |
|---|---|---|
| 看板派活 / 指派 / 状态机 | ✅ S01–S12 + 补齐 | Issue/Kanban/AssigneeSelect |
| 运行可观测 | ✅ 列表筛选 URL、失败分类、再执行 | RunsPage、run-observability |
| 在途可见 | ✅ 侧栏角标+芯片、CmdK、active 筛选 | `a3538f2`…`455f863` |
| Issue 多 run 回放 | ✅ 历史表驱动轨迹 | `5cb0001` |
| Inbox 失败诊断 | ✅ Issue#run-trace + Runs 双入口 | `485383e` |
| 自动化 schedule/run-now | ✅ 补5 + next 时刻 + 模板预览/编辑 | `bd6ec14`…`c0e4774` |
| Wiki / Memory 运营 | ✅ 健康检查、搜索 URL、CmdK | wiki-health / memory-ops |
| 就绪与 cwd 防护 | ✅ EnvBanner、QC/新建 Issue 警告、readiness chips | `4fbbb2a` `ff6a0d3` |
| @mention / 指派深链 | ✅ Markdown + card/header | `c8f1996` `40b2e27` |

## 刻意不做（宪法 / 目标边界）

| Multica 能力 | 本仓决策 |
|---|---|
| 云托管 / 多节点 / Redis | ❌ 纯本地 |
| webhook autopilot | ❌ 本地产品不默认外网事件源 |
| 自造 agent loop | ❌ Backend adapter 驱动本机 CLI |
| 完整 Multica daemon 协议 1:1 | 差异保留（TS 本地进程模型） |

## 仍弱 / 下一阶段候选（按日常价值）

| 缺口 | 为何还不够 Multica 感 | 建议厚度 |
|---|---|---|
| **工作区 cwd 一等配置 UX** | 诊断有，但首次启动仍易踩空导致大批 failed seed | Settings 引导 + 本地路径选择器（若 OS 允许） |
| **QC/指派后的首包反馈** | 失败快，但「刚派完立刻看到失败原因」仍可更贴脸 | 派活成功 toast → 失败 inbox/strip 联动强化 |
| **Squad 作战视图** | 有 briefing/成员就绪，缺 leader 委派时间线聚合 | Squad 详情 runs 时间线 |
| **Automation 运营深度** | 有 next/edit，缺失败聚合与暂停原因 | 规则级失败计数 |
| **大规模 issue 检索** | issue-find 有，CmdK 深度可继续 | 已够用，非 P0 |

## 达标判断（Owner）

**尚未宣称「已达 Multica 本地魔改版完成态」。**  
理由：主航道日常路径（派活→执行→失败诊断→在途→自动化→知识/记忆）已可天天用，且本会话显著补齐导航与失败闭环；但仍有**首次环境就绪**与**小队/自动化运营纵深**可演进。  
继续策略：短刀修体验债 + 每 2～3 刀更新本表，难逆架构不停问。
