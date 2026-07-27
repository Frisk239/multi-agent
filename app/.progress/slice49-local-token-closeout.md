# Closeout · Slice 49 · 本地 token（放开 bind）（S1）· 2026-07-27

## 交付

| Must | 结果 |
|---|---|
| `MA_LOCAL_TOKEN` | ✅ |
| 非 loopback + 有 token → API/WS 强制 | ✅ Bearer / X-MA-Token / `?token=` |
| loopback 日用无 token | ✅ |
| 非 loopback 无 token 启动 warn | ✅；`MA_LOCAL_TOKEN_REQUIRED=1` → exit 1 |
| healthz 始终放行 | ✅ |
| 密钥不落库 / Settings 一行说明 | ✅ |
| 单测 | ✅ 25 + bind 4 = 29 |
| e2e | ✅ pass=6（unit 路径 + live loopback） |
| typecheck | ✅ |

## 下一刀

**Slice 50 · Resume 能力矩阵**

## 裁决

**关刀。**
