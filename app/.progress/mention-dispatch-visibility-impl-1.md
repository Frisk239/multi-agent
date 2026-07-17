# Handoff: mention-dispatch-visibility-impl-1

> main 直推 · 2026-07-17 · Multica 差距：委派可见性

## 交付

- `comment-trigger.ts`：返回 dispatches；`announce` 写系统总结 comment  
- `POST .../comments`：`{ ...comment, dispatches }`  
- Timeline badge：`@提及` / `派发`  
- `useCreateComment`：有 dispatches 时 toast + invalidate  

## 证据

- typecheck 全绿  
- API：@agt-prd → dispatches runId 非空 + 系统 comment  
- Playwright：详情时间线 2+2 条，badge `@提及`/`派发`；composer 再 @agt-research 同样可见  

## Multica 对照

派发链路本仓已有；本刀补 **人眼可见**。下一刀可加深 leader briefing UI / 运行条联动。

## 勿 commit

wiki/ *.db
