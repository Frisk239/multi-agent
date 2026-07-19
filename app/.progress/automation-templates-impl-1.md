# automation-templates · impl-1（G15）

日期：2026-07-19

## 对照

| 源 | 结论 |
|---|---|
| Multica 真站 `/autopilots`（storage-state 登录） | 空态 6 卡模板画廊 +「从空白开始」+ Helper 侧栏 |
| Multica 源码 `views/autopilots/components/autopilots-page.tsx` TEMPLATES | daily_news / pr_review / bug_triage / weekly_progress / dependency_audit / documentation_check |
| 本仓 | 已有规则 CRUD + interval/daily 调度；缺画廊冷启动 |

## 决策

1. **前端预填为主**（不新增 API）：点卡片 → 打开创建表单并写入 name/schedule/title/body。  
2. **调度映射**：Multica weekdays/weekly → 本仓 `daily_at`（保留 Multica 默认时刻）。  
3. **不做** webhook 触发、云端 Autopilot 协议。  
4. Collection header + 画廊常驻（有规则时也能点模板）。

## 产物

| 文件 | 作用 |
|---|---|
| `shared/automation-presets.ts` | 6 预设 + 中文摘要/prompt |
| `AutomationPage.tsx` | 画廊 UI + `applyPreset` + collection header |
| `globals.css` | 卡片网格样式 |

## 验收

- Playwright Multica：`/autopilots` 登录态可见 6 模板文案  
- 本仓 `/automation`：`automation-template-gallery` 6 卡；点 `pr_review` → 表单 name/title/body 预填、preview 渲染  
- shared/web typecheck 通过  

## 非目标

- 一键「创建并启用」跳过指派确认（仍需选 agent/squad）  
- weekly 真 cron  
- Helper 侧栏（G10）
