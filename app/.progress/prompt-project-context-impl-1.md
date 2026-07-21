# prompt-project-context-impl-1（F6 · UX gap）

Date: 2026-07-21  
Branch: main

## 本刀范围
Issue prompt 的 **AGENTS / 项目 .skills** 相对 **resolved run cwd**（F1 project.localPath），避免隔离/错仓仍注入控制台 workspace 上下文。

## Multica 对照
- execenv 在 task WorkDir 侧写 context；local_directory 时用用户仓  
- 本仓：CLI cwd 已按 F1 切；prompt 侧同步读该根的 `AGENTS.md` 与 `.skills`

## 决策
| 模式 | AGENTS | agent 已分配 skill |
|---|---|---|
| `project_local` | 读该仓 AGENTS（managed 优先，否则全文截断） | **优先** `{localPath}/.skills` 正文 |
| `workspace` | 原 S08 workspace managed 块 | 全局索引（含 workspace .skills） |
| `isolated_*` | **不注入**；prompt 注明未绑定 | **跳过** source=project 的全局 skill；保留 user skill |

## 改动
- `runtime/issue-prompt-context.ts` — 与 resolveRunCwd 同源
- `runtime/prompt.ts` — buildPrompt + `resolveAssignedSkillsForContext`
- `skill/scanner.ts` — `loadSkillsFromRoot` / `skillsDirUnderRoot`
- `scripts/test-prompt-project-context.mts`

## 验收
| 项 | 结果 |
|---|---|
| typecheck | 0 |
| project_local | AGENTS marker + project skill body in prompt PASS |
| isolated | 跳过 AGENTS + 提示未绑定 PASS |

## 下一刀
F7 Settings 可行动 CTA；wiki/memory 仍可按全局（本刀未改 wiki store）。

## 不做
- wiki 文件系统按 project 分根  
- chat 绑定项目目录  
- QC 按 project（无 issue）  
