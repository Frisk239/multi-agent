# Slice 31 · Wiki 复利 · closeout

> 2026-07-27 · 计划 D3

## 交付

| 路径 | 内容 |
|---|---|
| `wiki/store.ts` | content-hash sidecar；index 幂等；log skip/query-save |
| `wiki/ingest.ts` | 同 hash skip LLM/写页 |
| `routes/wiki.ts` | query-save log |
| tests | store/ingest-hash/health |

## Must

1. ✅ hash 跳过重复有效 ingest  
2. ✅ index 幂等 · query 存页  
3. ✅ log 可 grep  
4. ✅ health 矛盾不回归  

## 证据

```text
wiki tests 8+ passed (store/ingest-hash/health)
typecheck Done
```

## 下一刀

Slice 32 Issue 侧滑
