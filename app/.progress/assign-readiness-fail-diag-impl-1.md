# Handoff: assign-readiness-fail-diag-impl-1

> 自动迭代 · main · 2026-07-17

## 交付

1. **指派前 readiness**（AssigneeSelect）  
   - option 文案带 ready/cwd/runtime 状态  
   - 阻塞态 confirm 文案（可仍继续）  
   - 当前指派非 ready 时橙色提示 + 链到 /settings 或 /runtimes  

2. **Run 失败一键诊断**（RunStatusBar）  
   - 始终有「打开诊断/运行时」（classify 链接）  
   - 新增「在运行列表中查看」→ `/runs?run=&status=`  

## 证据

- typecheck 绿  
- Playwright：failed FRI-11 → 打开诊断 → /settings；runs 链含 run id  
- Playwright：指派 agt-lead 后 option/hint 含 `cwd 未配置`  

## Multica

执行前可见阻塞、失败后进诊断面；本仓软提示不硬拦截。
