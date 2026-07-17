# Handoff: wiki-slug-url-impl-1

> 自动迭代 · main · 2026-07-17  
> 选型：Wiki **?slug=** 选中页 URL（对齐 memory ?q= 分享模式）

## 交付

- `WikiPage`：`searchParams.slug` 驱动选中；点击写 URL  
- 无效 slug 列表加载后清除  
- 可选 `?query=1` 打开问答对话框  
- `data-wiki-slug` / `data-testid`  

## 证据

- typecheck 绿  
- Playwright：`/wiki?slug=query-E2E-Alpha-Wiki` 高亮 + 正文 alpha  
- 点 Beta → URL 变为 `?slug=query-E2E-Beta-Wiki`  

## 下一刀建议

Wiki health 点选也写 slug URL（已走 setSelectedSlug）；CmdK 跳 wiki slug。
