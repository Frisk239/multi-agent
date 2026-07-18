# Closeout: settings-run-health

## 交付
- shared：`SettingsRunHealth` + `SettingsStatusResponse.runHealth?`
- server：`buildRunHealth()` 聚合 active / 龄期 / 阈值 / atRisk
- web：Settings「运行健康」卡片 + 在途/失败/收尸入口
- Spec：`.scratch/settings-run-health/spec.md`

## 证据
- typecheck：shared/server/web 绿
- API：`GET /api/settings/status` 含 `runHealth`；seed near-stale running → `atRisk.runningNearStale=1`
- Playwright：`/settings` 卡片文案含「运行健康 / 在途 1 · 近收尸 1 / 收尸阈值…」；testid active/recover/stats 存在

## 决策
- 不改阈值默认值（120s running / 30min queued / 15s sweep）
- atRisk = 龄期 ≥ 70% 阈值（提示近收尸，非已 fail）
- runHealth 可选字段，兼容旧客户端

## 偏离 / 债
- 未做 cwd 持久化写盘（仍 export env）
- 无时序图 / 历史收尸计数

## Multica 对照
- Multica FailStale + heartbeat 对运维透明；本刀把阈值与在途态暴露到 Settings

## 给下一 Owner
- 建议：cwd 持久化 ADR（难逆先文档）或 wiki dead / automation 健康指标对称卡片
