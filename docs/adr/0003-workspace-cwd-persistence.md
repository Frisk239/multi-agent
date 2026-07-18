# ADR 0003 — Workspace cwd 持久化（本地路径，非密钥）

- **Status:** Accepted  
- **Date:** 2026-07-18  
- **Deciders:** Slice Owner（自动迭代）· 对标 Multica 本机目录  

## Context

本仓执行层（run worker / readiness / wiki / skills）依赖 `MA_WORKSPACE_CWD`。补齐阶段只做了 **export 引导 + 诊断**，导致：

- 每次新终端 / 未带 env 的 `pnpm dev` → 全员 `cwd_missing`，派活失败
- 与「日常可用本地控制台」北星冲突
- Multica 侧以 daemon + `local_directory` 路径锁表达本机工作目录，不靠人每次 export

宪法仍要求：**不写密钥到磁盘 UI、纯本地、不自造 agent loop**。  
路径不是密钥；可安全落本地 SQLite。

## Decision

1. **`workspace.root_path`（可空 text）** 持久化当前工作区根目录。  
2. **解析优先级：**  
   `process.env.MA_WORKSPACE_CWD`（非空） **>** `workspace.root_path` **>** 未配置。  
   Env 仍作运维覆盖 / CI / 一次性覆盖。  
3. **启动时：** 若 env 未设且 DB 有有效路径 → `process.env.MA_WORKSPACE_CWD = root_path`，使已有读 env 的代码路径一致。  
4. **API：** `PUT/POST /api/settings/workspace-cwd` 接受绝对路径；校验存在且为目录；写入 DB 并更新当前进程 env。  
5. **Settings UI：** 可输入/保存路径；不再只靠「复制 export 行」。  
6. **不写** API Key / token 到 DB 或前端表单（仍 env-only）。

## Consequences

### Positive

- 重启/新会话可保留 cwd，日常可用  
- 与 Multica「本机目录可配置」体验对齐（实现保留 adapter 差异）  
- Env 覆盖仍在，便于调试

### Negative / Trade-offs

- 路径存本地 DB：换机器需重设  
- 多 workspace 未来若扩展，需 per-row root；当前单 workspace 足够  
- 不解决「路径不存在/盘符变化」——仍诊断 error

## Alternatives considered

| 方案 | 为何未选 |
|---|---|
| 仅 `.env` 文件写盘 | 与密钥混放风险；Windows 路径与 shell 片段仍摩擦 |
| 完全废弃 env | 破坏 CI/脚本与现有文档 |
| Multica `waiting_local_directory` 全状态机 | 过厚；本刀只需「有可执行根目录」 |
