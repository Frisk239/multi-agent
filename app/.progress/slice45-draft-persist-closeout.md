# Closeout · Slice 45 · 草稿持久化（U8）· 2026-07-27

> 计划：[slice-plan-2026-07-27-phase-c.md](./slice-plan-2026-07-27-phase-c.md)  
> Impl：[slice45-draft-persist-impl-1.md](./slice45-draft-persist-impl-1.md)

## 交付

| Must | 结果 |
|---|---|
| comment / chat / new-issue keys | ✅ |
| debounce 写盘 + 恢复 | ✅ `usePersistentDraft` ~300ms |
| 成功 clear | ✅ |
| Chat 按 thread 不串台 | ✅ key 随 threadId |
| unit | ✅ 7 passed |
| Playwright e2e | ✅ NewIssue 刷新恢复 + comment 恢复 + cancel clear |
| typecheck web | ✅ |

## Owner 复跑

```text
packages/web: vitest draft-storage → 7 passed
pnpm typecheck @ma/web → ok
e2e-slice45-draft-persist.mts → all PASS（WEB:3000）
```

## 下一刀

**Slice 46 · 看板卡 live 态**

## 裁决

**关刀。**
