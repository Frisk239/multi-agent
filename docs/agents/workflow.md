# 工作流 — Slice Owner × 验上一刀 × 子代理调研 × Push 审查

> 技能总路由：`/ask-matt`。  
> **默认编排：** 人 → **Slice Owner** → **先按交接文档验收上一刀** → **再 brainstorm 下一刀** → implement → **push feat/** → CI+review → **人远程合并**。  
> **可调用 skill：** 全局 **`/slice-owner`**（`~/.zcode/skills/slice-owner`，不进本仓 git）固化硬顺序；细则仍以本页 + [slice-handoff.md](./slice-handoff.md) + [merge.md](./merge.md) + ADR 0001/0002 为真源。

## 模型

```
人点主题 / 开新会话
   │
   ▼
┌──────────────────────────────────────┐
│  Slice Owner                         │
│  1) 读上一刀 closeout/impl/spec/票    │
│  2) intake 验收上一刀（短结论）        │
│  3) 通过后：短对齐 brainstorm 下一刀  │
│  4) implement → push feat/*          │
│  5) 关刀 closeout                     │
└──────────────┬───────────────────────┘
               │ push
               ▼
        CI + 分支 code-review
               │
               ▼
        人：远程合并 main
```

| 角色 | 干什么 |
|---|---|
| **Slice Owner** | 验上一刀 → 对齐下一刀 → 实现 → push → 关刀 |
| **调研子代理** | 读 deep/repos；Owner 只收摘要 |
| **CI / review** | push 后 typecheck + 分支 diff 审查 |
| **人** | 点题、**远程合并**、拍板主题 |

## 硬顺序（跨刀新会话）

1. **交接验收上一刀**（handoff / `app/.progress/*-impl|closeout` + `.scratch`）  
2. 写 **通过 / 有条件通过 / 需返工**  
3. 需返工 → 先修；否则 **短对齐 brainstorm 下一刀**  
4. implement → push → 人合并 → **关刀文档**给再下一任  

续作同一切片（窗满）：跳过「新主题 brainstorm」，只读 handoff 继续票。

## Grill / 调研

- 满血 grill **非默认**；下一刀用短对齐。  
- 「去调研」→ 子代理；禁止 Owner 窗灌上游全文。

## 合码

见 [merge.md](./merge.md)：不以开 PR 为中心；禁止 agent push main。

## 启动提示词

复制 [slice-handoff.md](./slice-handoff.md) 末尾模板，填 `<PREV_SLUG>` 与 `<NEXT_THEME>`。
