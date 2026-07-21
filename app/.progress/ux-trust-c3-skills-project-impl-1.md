# UX Trust C3 — Skills 按 project 运营

Date: 2026-07-21  
Branch: main

## 本刀范围

| 项 | 内容 |
|---|---|
| Must | 扫 `project.localPath/.skills`；导入目标 user / workspace / project+projectId；无 workspace 仍可用户级 |
| Out | skill 市场、多 resource、自动 git 同步 |

## 决策

| 项 | 选择 |
|---|---|
| source 三态 | `user` · `workspace`（原 cwd `.skills`）· `project`（绑 localPath） |
| 默认导入目标 | **user**（不挡无 cwd） |
| 旧 `target=project` 无 projectId | 兼容为 **workspace** |

## 改动

- `skill/scanner.ts` · `import-url.ts` · `routes/skills.ts`
- `shared` SkillInfo / Import* 契约
- `SkillsPage` · `CreateSkillDialog` · `web/lib/api.ts`
- `scripts/test-skills-project-c3.mts`

## 验收

| 项 | 结果 |
|---|---|
| test-skills-project-c3 | **ALL PASS** |
| typecheck | **PASS** |

## 下一刀

Wave D：**D1** Chat 过程可感（或 D2 workdir 叙事）

## 推送债

main 相对 origin **ahead**（含 C1–C3）；网络/代理恢复后 `git push origin main`。
