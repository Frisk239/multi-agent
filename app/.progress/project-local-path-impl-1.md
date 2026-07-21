# project-local-path-impl-1（F1 · UX gap）

Date: 2026-07-21  
Branch: main

## 本刀范围
Project **本机目录绑定**（学 Multica `local_directory`）：`project.local_path` + Issue 执行时优先该 cwd。

## Multica 对照
- `local_directory.go`：project_resource type=local_directory → AbsPath 作 agent workdir  
- `execenv.Prepare`：LocalWorkDir 非空则不用默认隔离 workdir  
- 本仓精简：单列 `local_path`（无 daemon_id / 多资源表）

## 决策
| 项 | 选择 |
|---|---|
| 存储 | `project.local_path` text nullable |
| 解析优先级（issue） | **projectLocalPath（有效目录）** → `MA_ISSUE_USE_WORKSPACE_CWD` → 隔离 workdir |
| 路径无效 | mode=none，run fail 明确文案（不静默回退错仓） |
| 未绑定 | 保持隔离默认（不强制 workspace） |
| API | `localPath` CRUD + 响应 `localPathExists` |

## 改动
- migration `0025_project_local_path.sql`
- schema / shared Project 类型
- `resolve-run-cwd.ts` + `run-worker.ts` 读 issue.projectId
- `routes/projects.ts`
- UI：ProjectDetail「本机目录」+ 列表「已绑定/路径无效」
- `scripts/test-project-local-cwd.mts`

## 验收
| 项 | 结果 |
|---|---|
| typecheck | 0 |
| unit | project_local / invalid / isolated PASS |
| API | POST path exists=true；坏路径 exists=false；清除 null |
| Playwright | 列表 path 列；详情显示路径+目录可用；编辑保存 |

## 下一刀
**F3** issue idle/wall timeout；或 F6 prompt/skills 按 project cwd 读（本刀仅 CLI cwd）。

## 不做
- Multica 完整 project_resource / daemon 绑定  
- AGENTS/skills/wiki 自动切仓（F6）  
- chat 会话级绑定项目目录  
