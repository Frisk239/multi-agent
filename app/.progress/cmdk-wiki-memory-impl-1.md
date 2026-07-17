# Handoff: cmdk-wiki-memory-impl-1

> 自动迭代 · main · 2026-07-17  
> 选型：CmdK 深链 **Wiki ?slug=** + **Memory ?q=**；并收紧 sqlite-text AND 检索

## 交付

- CommandPalette：Wiki 组（标题/slug 匹配 → `/wiki?slug=`）  
- 「在记忆中搜索「q」」→ `/memory?q=`  
- sqlite-text：须命中**全部** token；整串命中 +2  

## 证据

- typecheck 绿  
- API：`q=cmdk-unique-alpha` 仅 alpha 条  
- Playwright：CmdK「CmdK Wiki」→ wiki slug URL；「cmdk-unique-alpha」→ memory?q=  

## Multica

命令面板进知识面；本仓补 wiki/memory 深链与检索精度。
