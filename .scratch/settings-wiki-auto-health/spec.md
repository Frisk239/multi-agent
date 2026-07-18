# settings-wiki-auto-health

## 用户路径
运维打开 Settings → 看到 Wiki dead 任务数、自动化失败/启用规则摘要 → 一键跳 Wiki dead / Automation 失败筛选。

## Must
- shared：`SettingsWikiHealth` + `SettingsAutomationHealth`（挂 settings status）
- server：`buildSettingsStatus` 聚合 wiki dead 计数 + automation fail/enabled
- web：Settings 两张健康卡片（或合并「知识与自动化」区块）
- typecheck + API smoke + Playwright 可见

## Out of scope
- cwd 写盘
- 改 automation scheduler
- 完整报表