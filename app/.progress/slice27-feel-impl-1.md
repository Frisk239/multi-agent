# Slice 27 · 交互手感包 · closeout

> 2026-07-27 · 计划 U3

## 交付

| 路径 | 内容 |
|---|---|
| `chat-scroll.ts` + ChatPage | 近底吸底 · ↓ 新消息 |
| `use-focus-trap.ts` | CmdK / QC / Shortcuts / NewIssue form |
| Squads/Skills/MyIssues | PageSkeleton + ErrorState |
| `e2e-slice27-feel.js` | 46 pass 骨架 |

## Must

1. ✅ Chat stick + 新消息按钮  
2. ✅ Focus trap 主 dialog  
3. ✅ 三列表空错载统一  
4. ✅ e2e 骨架 + typecheck  

## 证据

```text
@ma/web typecheck OK
node scripts/e2e-slice27-feel.js → 46 passed
```

## 债

- live Playwright 需起 localhost:3000

## 下一刀

Slice 28 模型价表成本纵深
