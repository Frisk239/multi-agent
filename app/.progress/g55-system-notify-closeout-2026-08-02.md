# G5-5 系统/桌面通知 —— closeout（2026-08-02 第四波 M2）

**刀名：** G5-5 系统/桌面通知（run 终态 + inbox 新项 → Windows 原生弹窗）
**Goal：** G5（可靠性与运营）/ 目标 M2 运营闭环

## 背景与勘察结论

- 目标陈述：「run 完成/失败 + inbox 新项 → 系统通知（纯本地，优先 Electron 无依赖方案或 node-notifier；配置开关 + 默认关/开择一拍板）；不做推送服务」。
- 本仓是 **Node 后端 + Web 前端**，非 Electron ——「Electron 无依赖方案」不适用。
- 勘察确认 `inbox-writer.ts notifyInbox` 是 **inbox 新项唯一写入点**（run 终态经 `notifyRunTerminal` → notifyInbox，chat/issue/quick_create 全部汇聚）——系统通知单点挂此即可同时覆盖两个触发源。
- 偏好存储：`~/.multi-agent/inbox-prefs.json`（InboxPrefs，settings 路由已通用读写）。

## 技术选型（决策）

- **零 npm 依赖**：后端 spawn `powershell -NoProfile -NonInteractive` + WinForms `NotifyIcon.ShowBalloonTip`（Windows 原生通知，5s 后 Dispose 自退出）。不引入 node-notifier（native 二进制下载、与「纯本地零依赖」定位不符）。
- **开关默认关**（降噪——run 完成/失败弹窗会打断前台工作；与 F10 inbox 降噪哲学一致）；Settings「收件箱通知偏好」卡片加开关；env `MA_SYSTEM_NOTIFY=1` 强制开。
- **跟随 inbox 降噪**：系统通知只对「进 inbox 的项」弹。issue run 成功默认不进 inbox（F10 降噪）→ 不弹；想弹 → 开「Issue 成功兜底」。run 失败/chat 失败必进 inbox → 必弹。
- 失败静默降级（spawn error 不扰主流程）；非 Windows 跳过；同 title 5s 防抖 + 全局 2s 节流。

## 改动清单

| 文件 | 改动 |
|---|---|
| `orchestration/inbox-prefs.ts` | InboxPrefs + `systemNotifications: boolean`（默认 false）+ 读写兼容 |
| `orchestration/system-notify.ts`（新） | `isSystemNotifyEnabled`（env 强制开）/ `buildPowerShellNotifyScript`（单引号转义）/ `showSystemNotification`（spawn 防抖降级） |
| `orchestration/inbox-writer.ts` | notifyInbox 写库 + 发布后 → showSystemNotification |
| `routes/settings.ts` | PUT inbox-prefs 支持 systemNotifications |
| `web/lib/api.ts` | InboxPrefs 类型 + systemNotifications |
| `web/components/SettingsPage.tsx` | 通知偏好卡片加「系统桌面通知」开关（data-testid=settings-system-notify） |

## 测试与实证

- `orchestration/system-notify.test.ts`（新，7 用例）：开关默认关/prefs 开/env 强制开、PowerShell 脚本形态与单引号转义（`It's` → `It''s`）、空 title/body 兜底、开关关不 spawn、开关开 spawn powershell（win32）。
- 相关测试 11/11 绿；`pnpm typecheck` 全绿（shared/web/server）。
- **实证（验收标准：可选可配 + run 终态/inbox 触发 + 开关在 Settings + 不依赖云端）**：
  1. 手动 PowerShell 弹窗：exit 0，桌面真实弹出「Multi-Agent 实证」通知。
  2. 端到端：server 起 → PUT `/api/settings/inbox-prefs {"systemNotifications":true}` 生效 → grok run completed → inbox 生成 `run_completed | Run 完成 · FRI-335` → showSystemNotification 触发（server 日志无 spawn 错误，桌面弹窗）。
  3. 默认关验证：开关关时单测断言不 spawn。
  4. 测试数据已清理（agent/issue 删除，prefs 复位 false）。

## 下一刀建议

G5-6 运营统计加深（cycle time / agent 利用率 / 失败率趋势）——复用 usage/analytics 既有聚合框架。
