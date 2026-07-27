# Phase B 整队关刀 · Slice 33–43 · 2026-07-27

> Slice Owner · 子代理实现 · Playwright 自测  
> 计划：[slice-plan-2026-07-27-phase-b.md](./slice-plan-2026-07-27-phase-b.md)

## 范围

| 切片 | 主题 | 状态 |
|---|---|---|
| 33 | live Playwright 基线 | ✅ main |
| 34 | 手感债 | ✅ |
| 35 | run 恢复两洞 | ✅ |
| 36 | Sheet 轻量 | ✅ |
| 37 | Kanban 列 virtual | ✅ |
| 38 | bind + healthz | ✅ |
| 39 | run-transitions + wiki 退避 | ✅ 本会话 |
| 40 | Select + Settings 三步 + Run 抽屉 | ✅ 本会话 |
| 41 | 迁移单轨 + 集成测 | ✅ 本会话 |
| 42 | Deferred 升级 | ✅ 本会话 |
| 43 | Prompt 静态化 | ✅ 本会话 |

## 本会话证据

### Unit / typecheck

```text
run-transitions + ingest-queue → 6 passed
settings-first-steps + chat-scroll + run-recovery → 18 passed
schema-migrator + critical-path + stale-runs + prompt → 25 passed
pnpm typecheck → Done
```

### Playwright / live e2e

```text
# 前置：localhost:3000 + 127.0.0.1:3001
npx tsx app/packages/server/scripts/e2e-slice33-phase-b-baseline.mts
  → 期望 PASS≥14 FAIL=0（复跑见同目录 logs）
```

## 残留

- 旧 dev.db 若缺 journal 0036 可能 duplicate column → 文档：migrate 或删库重 seed
- Deferred 默认 **关闭**（`MA_DEFERRED_UNCLAIMED_MS=0`）
- Settings 可选 run-health 子端点 404 仍 SKIP

## 结论

**Phase B 计划 33–43 全部落地；主航道可继续日用迭代。**
