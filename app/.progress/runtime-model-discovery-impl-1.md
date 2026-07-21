# runtime-model-discovery · impl-1（G22 续）

日期：2026-07-21

## 目标

Agent 绑定 model 时，从本机 CLI **自动发现**可选模型列表（对齐 Multica `ListModels` / 真站下拉）。

## 实现

| 层 | 内容 |
|---|---|
| CLI | `opencode models` → 解析 `provider/id` 行（本机 170+） |
| API | `GET /api/runtimes/:id/models` → `{ runtime, installed, models[], source, error }` |
| claude-code | 静态 sonnet/opus/haiku（无稳定 list） |
| cursor | 尽力探测，失败则空（手填） |
| UI | Agent 详情：select 发现列表 + 手填；新建智能体同理 |

## 文件

- `server/src/runtime/list-models.ts`
- `server/src/routes/runtimes.ts`
- shared `RuntimeModel` / `RuntimeModelsResponse`
- web `useRuntimeModels` + AgentDetail / AgentsPage

## 证据

- typecheck 通过  
- 本机 `opencode models` 有输出；API 需 server 热更后验证  

## 未做

- Multica 式 thinking/variant  
- 缓存/后台异步长任务（opencode models 同步 20s 超时）  
