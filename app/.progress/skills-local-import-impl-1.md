# Closeout: skills-local-import

日期：2026-07-21

## Multica 对照

| Multica | 本仓 |
|---|---|
| Create skill 三选：手动 / URL / **从 runtime 本机导入** | **从本机路径导入**（无 daemon） |
| `runtime-local-skill-import-panel` 扫 runtime 上 skill，写入云 workspace | 扫任意本机目录，写入 **`<cwd>/.skills`** 或 **`~/.multi-agent/skills`** |
| 冲突：overwrite / rename / skip | overwrite 勾选；未勾选则 skip |
| 并发 daemon 拉文件 | 本地 `cp` / 写 `SKILL.md` |

源码：`packages/views/skills/components/create-skill-dialog.tsx` + `runtime-local-skill-import-panel.tsx`

## API

- `POST /api/skills/scan-local` `{ path }` → candidates + dest dirs  
- `POST /api/skills/import-local` `{ target, items[] }` → created/updated/skipped/failed  

## UI

Skills 页 **导入** 面板：路径、目标、扫描列表、多选、覆盖、结果。

## 证据

- typecheck shared/server/web 绿  
- scan `D:/code/multi-agent/.skills` → 5 candidates  
- import demo-imported + flat-smoke → created；列表可见  
- Playwright：`skills-import-panel` + scan 出 2 项  

## 债

- 无 URL 安装 / ClawHub  
- 无 rename 冲突流（仅 overwrite）  
- 未做 Multica 全量 create 手动表单（可下一刀）
