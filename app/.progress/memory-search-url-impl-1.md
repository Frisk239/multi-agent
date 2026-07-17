# Handoff: memory-search-url-impl-1

> 自动迭代 · main · 2026-07-17  
> 选型：Memory **?q=** URL mirror（日常知识入口可分享）

## 交付

- `MemoryPage`：searchParams `q`；输入防抖写 URL；`useMemoryList(qFromUrl)`  
- Issue 列链到详情；`data-testid` / `data-memory-id`  
- Suspense 包裹  

## 证据

- typecheck 绿  
- Playwright：`/memory?q=e2e-memory-alpha` 输入同步；改搜 `beta` → URL `?q=e2e-memory-beta`  
- API POST 创建两条记忆成功  

## 偏离

- sqlite-text 检索对短 token 可能较松（两行都出现）；本刀目标是 **URL 可分享路径**，非改检索算法。

## 下一刀建议

Wiki `?slug=` 选中页 URL；或 memory 检索打分收紧。
