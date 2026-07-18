# Closeout: settings-wiki-auto-health

## 交付
- shared：`SettingsWikiHealth` / `SettingsAutomationHealth` 挂 settings status
- server：聚合 wiki dead/pending/running + automation failed rules
- web：Settings「Wiki 与自动化」卡片 + 深链
- Spec：`.scratch/settings-wiki-auto-health/spec.md`

## 证据
- typecheck 绿
- API：`wikiHealth.dead=4`，`automationHealth.total=2 enabled=1`
- Playwright：`settings-wiki-auto-health` 等 testid 存在；正文含「Wiki 与自动化 / dead 4」

## 决策
- automation 失败规则从 `automation_run` 聚合（与 list API failCount 同源），不臆造 rule 表字段
- 与 runHealth 并列卡片，不塞进 checks 数组

## 债
- cwd 仍 export-only
- 无历史趋势图

## 给下一 Owner
- cwd 持久化 ADR；或 inbox/ops 汇总密度
