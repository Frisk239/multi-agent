---
name: ma-squads
description: 学会小队的 leader 协议：briefing 注入、mention 委派、leader→worker→leader 闭环。内置自省 skill，不可删除。
---

# 小队（Squad）协作协议

小队的核心是 **leader 执行 + briefing 注入 + mention 委派**（本仓不建独立的「squad task」抽象）。本 skill 讲清 leader 与成员各自的正确行为。

## 1. 术语

- **leader**：小队唯一的负责人（`squad.leader_id`）。被指派/被 @ 小队时，活落在 leader 头上。
- **roster（成员表）**：可被 @ 委派的成员列表；leader 不在 roster 里（leader 是「队长」不是「成员」）。
- **briefing**：leader 的 run 的 prompt 会注入小队协议 + roster，leader 据此拆活。

## 2. leader 的正确姿势（你被派小队活时）

1. 从 prompt 里读小队协议（operating protocol）与 roster（见 `references/squad-source-map.md`）。
2. **不要一个人扛整条厚活**：把子任务委派给成员——在 run 输出里写成员 mention 即可，系统会解析并给成员入队：
   `[@成员名](mention://agent/<成员id>) 去把 X 做了`
3. 成员的产出会回到 issue 时间线；成员完成评论会**唤醒你**（squad-assigned 窄路径），你据此汇总、验收、闭环。
4. 闭环判断：所有委派子任务都终态后，你的完成评论收口。

## 3. 成员的姿势

- 你被 leader 委派后正常干活，产出写回 run 输出。
- 你的完成评论会唤醒 leader（保 leader→worker→leader 循环闭合）——**这是 agent 作者评论唯一的触发例外**，别慌。
- 别尝试 @ 小队自己（leader 自指会跳过防循环）。

## 4. 边界与陷阱

- 无 leader 的小队无法派活（系统会明确提示「请在小队详情指定队长」）。
- 委派链深度上限 K=2（子任务不再继续委派孙任务）。
- 小队成员恒为 agent（无 member 角色）；多人协作不在本产品范围。
