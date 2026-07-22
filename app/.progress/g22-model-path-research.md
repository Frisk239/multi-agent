# Research: G22 Agent model 完整路径（补洞）

Date: 2026-07-22  
Owner 拍板后实现

## 结论

**绑定主路径已闭合**（`agent.model` → API → Detail UI → worker → 四 runtime `--model`）。  
**「完整路径」仍缺诚实与创建对称**，不是重做 binding/discovery/DS4。

| 已有 | 债 |
|---|---|
| schema model + thinking_level | create 表单无 freeform / 弱 error / 无 thinking |
| list-models + `/runtimes/:id/models` | run 不落盘 model 快照，无法证明本 run 用了啥 |
| 四 backend 均能传 `--model` | grok print 路径丢 `--effort`（thinking） |
| Detail 发现列表 + 手填 | Agents 列表不展示 model；gap 表 07-17 仍写 G22 open（stale） |

## 本刀 Must

1. worker spawn 前 log：`[model]` / `[thinking]`；**claim 时**把 model/thinking 快照到 `agent_run`（需 migration 或复用既有列若有）
2. Create 表单对齐 Detail：freeform + catalog error/installed + thinking
3. grok `tryPrintMode` 传 thinking → `--effort`
4. Run 详情诚实展示本 run 的 model/thinking 快照（若加列）
5. 更新 gap / progress；不重做 DS4 枚举

## Out

- opencode models 缓存 / 异步
- pi runtime
- cursor 完美 list
- 云账单

## 推荐厚度

一刀端到端：schema 快照（若必要）+ worker + grok 修 + create UI + Run 详情条 + smoke。
