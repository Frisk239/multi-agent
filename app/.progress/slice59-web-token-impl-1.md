# Slice 59 · 局域网 token Web 闭环 · impl-1

> 2026-07-27 · 不 commit/push

## 上下文

Slice 49 服务端 `MA_LOCAL_TOKEN` + `X-MA-Token` 已就绪；Phase C 残留：Web fetch/WS **未**自动带 token。本刀补 Web 注入 + Settings 只读检测。

## 本会话完成了什么

| 路径 | 内容 |
|---|---|
| `packages/web/lib/local-token.ts` | public env 读 token、headers/WS URL 注入、Settings 文案 helpers |
| `packages/web/lib/local-token.test.ts` | 12 unit（mock env + fetch header 注入） |
| `packages/web/lib/api.ts` | `apiFetch` + `API`（`NEXT_PUBLIC_API_URL`）；全部 hooks 走 `apiFetch` |
| `packages/web/lib/ws.ts` | WS 连接 `withLocalTokenWsUrl`（`?token=`） |
| `packages/web/components/*` | 散落 fetch 改 `apiFetch`（AssigneeSelect / HelperRail / Inbox / Chat / …） |
| `packages/web/components/SettingsPage.tsx` | 只读「局域网 Token」面板（server 检查 + 前端 env 是否配置） |
| `packages/web/.env.example` | `NEXT_PUBLIC_MA_LOCAL_TOKEN` 文档 |
| `packages/server/.env.example` | 交叉指向 Web public token |
| `packages/server/scripts/e2e-slice59-web-token.mts` | unit + live API + 可选 WEB |

## 拍板：Token 来源

```
Web 唯一来源：process.env.NEXT_PUBLIC_MA_LOCAL_TOKEN（启动/构建注入）
Server：MA_LOCAL_TOKEN（已有 Slice 49）

禁止：Settings 表单 / DB 存密钥
HTTP：apiFetch → X-MA-Token（不覆盖调用方已有 Authorization/X-MA-Token）
WS：?token=（浏览器无法自定义 header）
兼容：无 public token 时行为与改前一致；loopback 服务端不强制
```

## 自测结果

```text
cd app/packages/web && pnpm exec vitest run lib/local-token.test.ts
→ 12 passed

pnpm --filter @ma/web typecheck
→ 0 error

pnpm --filter @ma/server typecheck
→ 0 error

cd packages/server && pnpm exec tsx scripts/e2e-slice59-web-token.mts
→ unit PASS；live healthz/api PASS；web.settings WARN（CSR HTML 壳）
log → app/.progress/logs/e2e-slice59-web-token-*.log
```

## Out / residual

- 未改 bind 默认
- 未做 Runtime capture（60）
- Settings 仍无密钥输入框/入库
- 个别历史相对路径 bug（`/api/...` 打到 Next 而非 server）顺带修为 `API` 绝对地址
- WEB 可达时 Settings 文案可能仅 CSR 挂载 → e2e WARN 可接受；data-testid=`settings-local-token`

## 验收命令

```bash
cd D:/code/multi-agent/app
pnpm exec vitest run packages/web/lib/local-token.test.ts --reporter=dot
pnpm --filter @ma/web typecheck
pnpm --filter @ma/server typecheck
cd packages/server && pnpm exec tsx scripts/e2e-slice59-web-token.mts
```
