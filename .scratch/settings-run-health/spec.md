# settings-run-health

## 用户路径
运维打开 Settings → 看到在途 run 计数、最老 queued/running 龄期、心跳/排队收尸阈值 → 可跳到 `/runs?status=active` 或一键收尸。

## Must
- shared：`SettingsRunHealth` 挂到 `SettingsStatusResponse`
- server：`buildSettingsStatus` 聚合 active counts + 龄期 + 阈值常量
- web：Settings「运行健康」卡片（data-testid）+ 深链
- typecheck + API smoke + Playwright 卡片可见

## Out of scope
- cwd 持久化写盘 UI / ADR 全文
- 改 stale 阈值默认值
- 生产级时序图表
