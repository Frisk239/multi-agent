# 工作流 — Slice Owner × 验上一刀 × 子代理调研 × Push 审查

> 技能总路由：`/ask-matt`。  
> **默认编排：** 人 → **Slice Owner** → 验上一刀 → 短对齐下一刀 → implement → **Playwright** → **commit/push main**（默认可直推）。  
> 交接：[slice-handoff.md](./slice-handoff.md) · 合码：[merge.md](./merge.md) · ADR 0001；合码简化见 merge（覆盖旧 ADR 0002 默认）。

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
│  4) implement → Playwright 自测路径   │
│  5) commit/push main → 关刀 closeout  │
└──────────────┬───────────────────────┘
               │（定期，非每刀必做）
               ▼
        Multica 对照 → 调整下一刀方向
```

| 角色 | 干什么 |
|---|---|
| **Slice Owner** | 验上一刀 → 对齐下一刀 → 实现 → **Playwright** → **main 直推** → 关刀 |
| **调研子代理** | 读 deep/repos（**主参考 Multica**）；Owner 只收摘要 |
| **CI / review** | 可选；push main 可触发 typecheck |
| **人** | 点题、大方向；可随时要求改回 feat 隔离 |

## 北星（迭代约束）

**最终任务：** 产出**日常可用**的纯本地编排控制台，体验对标 **Multica**（不抄云托管）。

| 约束 | 要求 |
|---|---|
| **垂直切片** | 一刀 = 一条可演示用户路径（契约+API+UI 同刀，默认不 API-only） |
| **关刀自测** | 每刀结束前 **Playwright CLI** 走通本刀 Must 路径；证据写入 `app/.progress/<slug>-impl-*.md`（URL、断言、失败则不宣称完成） |
| **对照调方向** | **定期**（建议每 2～3 刀或人点名）对照 `references/deep/multica.md` + 必要时 `references/repos/` Multica 源码；输出**短差距清单**（我们有/无/偏差），再选下一刀——**禁止** Owner 窗灌大段上游 |
| **调研默认** | 路线犹豫、交互不确定 → **先调研 Multica（子代理）** 再实现 |
| **合码** | **默认 main 直推**；可选 feat 隔离 |

**Playwright 自测最低要求（关刀门禁）：**

1. `pnpm typecheck` 绿  
2. 本刀用户路径：`playwright-cli` 打开 **`http://localhost:3000`**（与 API `localhost:3001` 同源字符串，避免 CORS）  
3. 至少：进入相关页 → 执行核心操作 → 可见结果（URL/DOM/API 抽查写进 progress）  
4. 浏览器起不来时：写明原因 + API smoke 替代，并标 **有条件通过**（下一刀或人评补浏览器）

**Multica 定期对照最低要求：**

1. 选 1 条本阶段用户路径（如看板分诊、详情编辑、小队委派）  
2. 查 deep 索引 + 必要时 grep 上游 → **≤1 页**差距表  
3. 结论只驱动**下一刀候选**，不自动开大重构  

## 硬顺序（跨刀新会话）

1. **交接验收上一刀**（handoff / `app/.progress/*-impl|closeout` + `.scratch`；核对是否写了 Playwright 证据）  
2. 写 **通过 / 有条件通过 / 需返工**  
3. 需返工 → 先修；否则 **短对齐 brainstorm 下一刀**（可引用最近 Multica 差距表）  
4. implement → **Playwright 自测** → commit/push **main** → **关刀文档**给再下一任  
5. 每 2～3 刀或人要求：跑一轮 Multica 对照，更新「下一刀方向」  

续作同一切片（窗满）：跳过「新主题 brainstorm」，只读 handoff 继续票；续作关刀仍要 Playwright。

## Grill / 调研

- 满血 grill **非默认**；下一刀用短对齐。  
- 「去调研 / 对齐 Multica」→ 子代理；禁止 Owner 窗灌上游全文。  
- 主参考：**Multica**；辅：hermes / pi / 本仓 prototype。

## 合码

见 [merge.md](./merge.md)：默认 main 直推；不以开 PR 为中心。

## 启动提示词

复制 [slice-handoff.md](./slice-handoff.md) 末尾模板，填 `<PREV_SLUG>` 与 `<NEXT_THEME>`。  
开场可加一句：`关刀前 Playwright 自测；定期 Multica 对照调方向。`
