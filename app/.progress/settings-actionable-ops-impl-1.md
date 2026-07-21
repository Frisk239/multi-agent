# settings-actionable-ops-impl-1（F7 + 余量 F8 / F5 inbox）

Date: 2026-07-21  
Branch: main

## 本刀范围
1. **F7** Settings 诊断行：每项带 `href` + `actionLabel`；`?tab=` 深链；去掉硬编码 `D:/code/multi-agent` 示例路径  
2. **F8 余量** 指派 UI 硬拦：cwd_missing / runtime_missing / error 与服务端闸对齐（alert 拒绝，不再 confirm 硬闯）  
3. **F5 余量** Inbox「恢复」：先读 run.kind，chat→会话 / QC→重派 / issue→retry  

## 改动
- shared `SettingsCheck.actionLabel`
- `routes/settings.ts` checks 补全链接
- `SettingsPage` tab 深链 + check CTA 文案 + env 片段用真实 cwd
- `AssigneeSelect` / `NewIssueForm` 硬拦
- `InboxPage` recover 分流
- `settings/page.tsx` Suspense

## 验收
| 项 | 结果 |
|---|---|
| typecheck | 0 |
| API | cwd `action=查看路径` href `?tab=workspace`；runtime/wiki/memory 均有 action |
| Playwright | check-list · 9 actions · cwd「查看路径」· 无硬编码 D:/ 默认 export |

## 下一刀建议
F9 skills 运营 per-project · F10 Inbox 噪音 · F11/F12 可选深

## 不做
tool watchdog；wiki 分根；PriorWorkDir  
