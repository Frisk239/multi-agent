# Slice 49 · 本地 token（放开 bind 时）（S1）· impl-1

> 2026-07-27 · 不 commit/push

## 上下文

Slice 38 默认 listen `127.0.0.1`；`MA_BIND=0.0.0.0` 时 API/WS 曾可裸奔。本刀加 **env 本地 token 门闩**：仅非 loopback + 已配置 `MA_LOCAL_TOKEN` 时强制；loopback 日用不变。

## 本会话完成了什么

| 路径 | 内容 |
|---|---|
| `packages/server/src/local-token.ts` | 纯函数 + Fastify `onRequest` guard |
| `packages/server/src/local-token.test.ts` | 25 单测 |
| `packages/server/src/app.ts` | `registerLocalTokenGuard` |
| `packages/server/src/index.ts` | listen 前 warn；`MA_LOCAL_TOKEN_REQUIRED=1` → exit 1 |
| `packages/server/src/routes/settings.ts` | server 行提示 MA_LOCAL_TOKEN（无输入框/不入库） |
| `packages/server/.env.example` | `MA_LOCAL_TOKEN` / `_REQUIRED` / `_ALWAYS` 注释 |
| `packages/server/scripts/e2e-slice49-local-token.mts` | unit smoke + live healthz/api loopback |

## 拍板行为

```
token = trim(MA_LOCAL_TOKEN); empty → 未配置
nonLoop = !isLoopbackHost(HOST)

if (token):
  require = nonLoop OR MA_LOCAL_TOKEN_ALWAYS
  # loopback 默认不强制（日用）
else:
  require = false
  if nonLoop: startup warn（兼容旧文档，请求不强制）

if MA_LOCAL_TOKEN_REQUIRED=1 && nonLoop && !token:
  process.exit(1) before listen
```

- 传递：`Authorization: Bearer` **或** `X-MA-Token`；WS：`?token=`
- **`GET /healthz` 始终放行**
- 密钥不落库、Settings 仅一行说明

## 自测结果

```text
pnpm exec vitest run packages/server/src/local-token.test.ts
→ 1 file, 25 tests passed

pnpm --filter @ma/server typecheck
→ 0 error

pnpm exec tsx scripts/e2e-slice49-local-token.mts
→ unit PASS；live healthz/api 视本机是否起服
```

## Out / 债

- **Web 未改**：loopback e2e 不依赖 token；局域网浏览器访问需同机反代或后续 `NEXT_PUBLIC_MA_LOCAL_TOKEN`（Out，避免拖刀）
- OAuth / 多用户 ACL / Prometheus：Out
- 非 loopback 无 token 默认 **warn 仍放行**（兼容）；严模式用 `MA_LOCAL_TOKEN_REQUIRED=1`

## 残留风险

- 局域网 + 未设 token：请求仍裸奔（有启动 warn + Settings warn 行）
- WS 浏览器难设 header：必须用 query `?token=`（server 已支持；web 客户端未接线）

## 验收命令

```bash
cd D:/code/multi-agent/app
pnpm exec vitest run packages/server/src/local-token.test.ts packages/server/src/bind.test.ts --reporter=dot
pnpm --filter @ma/server typecheck
cd packages/server && pnpm exec tsx scripts/e2e-slice49-local-token.mts
```
