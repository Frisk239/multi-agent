---
name: ma-working-on-issues
description: 学会在本平台里正确接活、干活、收活：issue 状态流转、CLI 回写建卡、完成与失败行为。内置自省 skill，不可删除。
---

# 在本平台处理 Issue 的正确姿势

你是被编排的 agent。本 skill 讲清楚「活是怎么派到你头上、你干完系统会发生什么、失败怎么办」——照做，别自创协议。

## 1. 你为什么会接到这个 run

一个 run 的产生只有三种来源（详见 `references/issue-workflow-source-map.md`）：

1. **人被 @ 了**：有人在 issue 评论里写 `[@你](mention://agent/<你的id>)` → 你被入队。
2. **你是指派人**：issue 指派给了你，人在 issue 上发了普通评论（没有任何 @）→ 评论路由默认把活派给指派人（这是「评论即续工」闭环）。
3. **你被追问**：你上一条评论被人回复 → 回复唤醒你（thread-parent 路由）。

## 2. 接活后的工作流

1. 从 run 的 prompt 里读 issue 描述与上下文（含已注入的 Memory 相关片段与 Squad 协议）。
2. 干活。产出写回 run 输出即可——系统会在 run 完成后**自动**：
   - 给 issue 追加一条你的完成评论（时间线可见）；
   - 记 activity（`run_completed`）；
   - 若你的输出里按子代理协议提到了成员，系统会解析并委派子任务。
3. 建子卡用 CLI 回写：`ma issue create --title "..." --description "..." --assignee-type agent --assignee-id <id> --origin-run <MA_RUN_ID>`（必须带 `--origin-run` 保持溯源）。
4. 想确认平台健康度：`ma wiki health` / `ma wiki query "<问题>"`。

## 3. 状态与失败语义（别误判）

- **run 完成 ≠ issue 状态变更**：完成只写评论与 activity，issue 状态仍由人决定（看板上的 todo/in_progress/done 不因你跑完自动跳）。
- **你连不上**（CLI 探测失败 / spawn ENOENT / runtime offline）：系统先自动重试，预算用尽后若你的 agent 配置了「后备 agent」，**活会自动转给后备**——你的 run 会被标记 failed 并在错误里注明「已自动改派给 X」。这不是你的过错，不需要你补救。
- **慢/卡**（心跳超时）：会走 stale 收尸，人会在 Inbox 看到提醒。
- **执行失败**（CLI 跑了但报错）：run 标记 failed，写失败评论，人可回复你追问或手动 rerun。

## 4. 边界

- 不要尝试调用「未在 prompt 里给你的工具」；本平台不做 tool registry（工具归属你绑定的 CLI）。
- 不要自己修改 issue 状态字段——没有 CLI 通道，改状态请用评论说明意图，由人操作。
