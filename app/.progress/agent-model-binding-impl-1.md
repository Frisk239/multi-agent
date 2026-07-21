# agent-model-binding · impl-1（G22）

日期：2026-07-21

## 目标

智能体不仅绑定 **runtime（CLI）**，还可绑定 runtime 内 **model**（对齐 Multica `agent.model` + `opencode --model`）。

## 决策

| 项 | 选择 |
|---|---|
| 存储 | `agent.model text null`；空=跟随 CLI 默认 |
| API | `AgentDetail.model` / Create·Update 可选 `model` |
| spawn | opencode：`run --model <id> <prompt>`；claude：`-p … --model`；cursor：追加 `--model` |
| UI | Agent 详情「运行时」下增加「模型」输入 + datalist 建议；新建表单同字段 |
| 生效时机 | 仅 **新 enqueue 的 run**（与 Multica 文档一致） |
| 发现 | 首版手填/建议列表；不做 `opencode models` 探测 |

## 证据

- typecheck：shared / server / web 通过  
- `GET/PATCH /api/agents/agt-lead` 返回 `model`  
- 活库四 agent：`runtime=opencode`，`model=opencode/big-pickle`  
- 迁移：`drizzle/0021_agent_model.sql` + journal idx 21  

## 文件

- schema / migrate / seed / reshape / roster  
- runtime types + opencode / claude-code / cursor  
- run-worker 注入 model  
- web AgentDetailPage / AgentsPage  

## 未做

- 按 runtime 动态模型发现 API  
- thinking level / variant（Multica 另字段）  
