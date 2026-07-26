# 第二轮切片计划 · 2026-07-24

> 调研方法：3 路并行子代理（Multica 对照 / 代码审计 / 参考项目扫描）
> 编号续接 Slice 1-6（已完成）

## 切片清单

| # | 切片 | 状态 | 核心问题 |
|---|---|---|---|
| 7 | 全站三态体验统一（骨架屏/空态/错误态） | ✅ 已完成 | 数十处硬编码加载中、空态干瘪、错误态不一致 |
| 8 | Issues API 分页 + DB 级过滤重构 | ✅ 已完成 | 全量 select + 内存 filter → 性能炸弹 |
| 9 | 调度透明化 + 防挂死保护 | ✅ 已完成 | Enqueue 无原因、超时单一、Runs CTA 错位 |
| 10 | 上下文围栏 + 流式 Scrubber | ✅ 已完成 | Memory/Wiki 注入裸露 |
| 11 | Inbox 降噪 + Settings 一键排障 | ✅ 已完成 | 成功全量推通知、健康卡无操作闭环 |
| 12 | TypeScript 强类型 + API 错误统一 | ✅ 已完成 | any 散布、错误响应格式乱 |

## 验证结论
全仓 `pnpm run typecheck` 校验 **0 error** 通通过，所有改动已合并推送至 `main`。

## 详细设计

见 [implementation_plan.md](../../.gemini/antigravity/brain/d8efe82b-a758-4f08-ab45-95ba7763b2ed/implementation_plan.md)
