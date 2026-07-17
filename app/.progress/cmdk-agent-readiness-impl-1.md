# Handoff: cmdk-agent-readiness-impl-1

> 自动迭代 · main · 2026-07-17

## 交付

- `useAgentsReadinessMap`：并行 GET readiness  
- CmdK 智能体 hint：`ready|busy|cwd 未配置|runtime 缺失 · runtime`  
- CmdK 诊断：**运行时探测** → `/runtimes`  
- RuntimesPage `data-testid=runtimes-page`  

## 证据

- typecheck 绿  
- Playwright：搜「策划队长」→ hint 含 `cwd 未配置 · claude-code`  
- Playwright：搜「运行时探测」→ `/runtimes`  

## Multica

执行前可见 agent/runtime 就绪；本仓 CmdK 暴露 readiness + 探测页。
