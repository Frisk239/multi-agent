# Closeout: live-run-toast

## 交付

- `ws.ts`：run:failed → toastError + 去处理/Issue/运行列表
- run:completed → toastSuccess + 打开 Issue/查看运行

## 证据

- typecheck 绿
- Playwright：Issue 再执行后出现「工作区目录未配置」失败 toast；点「去处理」→ `/settings` 且 cwd guide 可见
