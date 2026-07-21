# inbox-noise-f10-impl-1（F10 + F9 文案余量）

Date: 2026-07-21  
Branch: main

## 本刀范围
- **降噪：** issue `completed` 默认 **不进** Inbox（`MA_INBOX_NOTIFY_SUCCESS=1` 可开回）  
- **补漏：** chat **failed** 进 Inbox（`action_required` · 标题含会话短 id）  
- chat completed / 默认 issue completed 静默；QC 成功仍推（建卡闭环）  
- F9 余量：项目级 skill 写入失败文案引导用户级 / localPath  

## 改动
- `inbox-writer.ts` `notifyRunTerminal` 策略  
- `skill/scanner.ts` + `import-url.ts` 错误文案  
- `scripts/test-inbox-noise-f10.mts`（含落库 chat run 供恢复 CTA）  
- Inbox 恢复：run 缺失时标题兜底去 `/chat`  

## 验收
| 项 | 结果 |
|---|---|
| unit | chat fail +1 · chat ok 0 · QC ok +1 · issue ok 0 · issue fail +1 |
| typecheck | 0 |
| **Playwright E2E** | `hasChatFail` · `recoverBtn` · **`recoveredToChat:true`** · settings 9 actions · runs openChat/retry 分支在 |

## 下一刀
F9 skills UI 深 · F11/F12 可选；或收官更新 gap 表。

## 不做
成功 run 全量可订阅细粒度 per-issue mute（未做 UI）。
