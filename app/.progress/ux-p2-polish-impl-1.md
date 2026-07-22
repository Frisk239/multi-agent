# UX P2 Polish 关刀

Date: 2026-07-22  
Commit: pending push

## 交付

| ID | 内容 |
|---|---|
| A | Issues 看板/列表切换 `?view=list` |
| B | `inbox-prefs.json` + Settings 开关；env 仍可强制成功推送 |
| C | Chat：`run:progress` 像正文时 appendPartial |
| D | `MA_WIKI_DIR` + wiki meta source=env\|workspace\|cwd |
| E | session resume **明确不做** |

## 验收

- typecheck PASS  
- `scripts/test-p2-polish.mts` ALL PASS  

## 不做

CLI session PriorWorkDir 真 resume · 看板手动排序 · Wiki 按 project 多根大迁移
