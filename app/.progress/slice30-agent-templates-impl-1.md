# Slice 30 · Agent 模板库收官 · closeout

> 2026-07-27 · 计划 D2 · 还 Slice21 债

## 交付

| 路径 | 内容 |
|---|---|
| `shared/agent-templates.ts` | 10 个中文本地模板 |
| `GET/POST /api/agent-templates` | list + create-from-template |
| `AgentBuilderWizard` | 接 API；一键/向导创建 |
| roster `allowedPaths` 持久化 | 顺手修 |

## Must

1. ✅ ≥8 模板  
2. ✅ list/create API  
3. ✅ Wizard 接线  
4. ✅ 无密钥入库  
5. ✅ typecheck + 单测  

## 证据

```text
agent-templates + roster + wizard tests green
typecheck Done
```

## 下一刀

Slice 31 Wiki 复利
