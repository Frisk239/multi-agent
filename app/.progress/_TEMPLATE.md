# Handoff / Closeout: <slug>-<role>-<n>

> 切片：`<slug>` · 角色：`owner | intake | review` · 日期：YYYY-MM-DD  
> 跨刀约定见 [docs/agents/slice-handoff.md](../../docs/agents/slice-handoff.md)

## 上下文

> 这刀是什么、在产品演进里的位置。下一会话先读本文件 + `.scratch/<slug>/` + CONTEXT.md。

## 本会话完成了什么

- ...

## 自测结果（必须有证据）

```
$ pnpm -r typecheck
（贴摘要）
```

## 偏离

> 无则写「无」。

## 未做 / 债 / 合并注意

- ...

## 分支

- `feat/<slug>` @ `<sha>` · 已 push：是/否 · 请人远程合并：是/否

## 给下一 Owner

- 验收时优先看：…
- 建议下一主题（可选）：…

## 下一 Owner 验收（intake · 由下一会话填写）

- [ ] 读过 closeout/impl + spec/票
- [ ] git：上一刀是否已在 main（人合并；不 push main）
- [ ] 证据可复核
- 结论：`通过` / `有条件通过` / `需返工`
- 债与风险：…
