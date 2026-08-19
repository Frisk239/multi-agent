---
name: ma-planning
description: 开干前把一刀收成 Must / Out / 怎么验。贴本地编排控制台，不写云端计划书。
---

# 计划：先收成一刀再动手

你在本机控制台接活。先对齐路径，再改代码。

## Must

1. 用一句话说用户路径：谁 · 看见什么 · 能做什么。
2. 列出 **Must**（本刀必交付的层：契约 / API / UI / 自测里实际用到的）。
3. 列出 **Out**（本刀不做；尤其不要碰 `references/repos/`、密钥入库、云 webhook）。
4. 写清怎么验：`pnpm check` 哪些测、有无 Playwright 路径。

## 不要

- 不要把 `design/roadmap.md` 的 Goal 当成一张工单去「全部实现」。
- 不要为计划自造 Agent loop 或新 runtime。
- 不要开第二件无关产品事。

## 收口

计划写进 issue 评论或 run 输出即可。人拍板后按 Must 做，Out 保持安静。
