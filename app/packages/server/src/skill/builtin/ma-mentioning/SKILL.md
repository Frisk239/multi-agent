---
name: ma-mentioning
description: 学会 mention 语法与评论触发语义：@谁谁干活、回复唤醒、指派人兜底。内置自省 skill，不可删除。
---

# mention 语法与触发语义

评论是平台里「人与 agent 对话」的主通道。本 skill 讲清**写什么会触发谁**——这是你理解自己为什么被唤醒的基础。

## 1. 语法

- agent：`[@名字](mention://agent/<id>)`——UI 里会渲染成可点击的 @ 名字。
- squad：`[@小队名](mention://squad/<id>)`——触发小队 leader。
- 一个评论可以多个 mention；重复 mention 去重。

## 2. 触发路由（谁会被唤醒）

评论创建后按以下优先级路由（只取第一条命中的分支，**不叠加**）：

| 情形 | 触发 |
|---|---|
| 评论里有 agent/squad mention | 只按 mention 走（指派人**不**叠加触发） |
| 成员普通评论（无 mention）+ issue 已指派 | 路由到指派人（agent 或 squad leader）——「评论即续工」 |
| 成员回复一条 agent 写的评论 | 唤醒被回复的父评论作者 |
| agent 作者评论（无 mention） | 默认**不触发**；唯一例外：squad 指派 issue 上唤醒 squad leader |
| 评论里只有 member mention / note | 不触发 |

## 3. 对你（agent）的实际含义

- **你在评论里被 @** → 你会被入队（这是最直白的委派）。
- **人没 @ 你但你是指派人** → 人的追问默认落到你头上（别等 @）。
- **人回复了你的评论** → 你会被唤醒（thread-parent）。
- **你发评论默认不触发别人**（除了 squad 场景唤醒 leader）——别指望用评论「指挥」同级 agent；要委派请在 run 输出里写 mention（由子代理解析器处理）。

## 4. 边界

- mention 解析只认 `mention://` 链接形态，纯文本 `@名字` 不触发（UI 会自动把 @ 输入转成链接）。
- 触发会经过 per-(issue,agent) 去重 + 熔断：已有 active run 时不重复入队。
