# Slice 交接 — 关刀 · 验上一刀 · 开下一刀

> 真源配套：`AGENTS.md` §工程模式 · [workflow.md](./workflow.md) · [merge.md](./merge.md)  
> 合码由**人远程合并**；下一 Slice Owner **不负责** `git push origin main`。

## 两种交接

| 类型 | 何时 | 下一会话干什么 |
|---|---|---|
| **续作** | 同一切片窗满 / 票未做完 | 读 handoff + 同一 `feat/*`，继续 implement |
| **跨刀** | 上一刀已交付（通常已 push，人将合或已合） | **先验收上一刀文档与证据 → 再 brainstorm 下一刀** |

下文默认是 **跨刀**（最常见：新开一个 Slice Owner 会话）。

---

## 关刀清单（当前 Owner 结束前必做）

在宣布「这刀做完、可以交给下一会话」前：

1. **证据**：typecheck / 相关 smoke（及若做了 Playwright）写进 progress 或 ticket  
2. **偏离**：与 spec 不一致处写清（无则写「无」）  
3. **未做 / 债**：刻意不做、已知坑、合并注意点  
4. **push**：`feat/<slug>` 已在远程（或文档-only 已说明）  
5. **关刀文档**（推荐路径之一，名称可带序号）：  
   `app/.progress/<slug>-impl-*.md` 或 ticket `## Comments` + 可选 `/handoff`  
6. **CONTEXT.md**：更新「下一刀」为待定或人已点名的主题（勿留过期刀名当已完成）

关刀文档至少让下一 Owner 能回答：合没合、测了啥、差啥、别踩啥。

### 关刀文档建议结构

```markdown
# Closeout: <slug>

## 交付
- 分支：feat/<slug> @ <sha>
- Spec/票：.scratch/<slug>/…
- 是否已请人远程合并：是/否

## 证据
- typecheck / smoke / 手验要点

## 偏离 / 未做 / 债
- …

## 给下一 Owner
- 验收时优先看：…
- 建议下一主题（若有）：…
```

---

## 下一 Slice Owner 开场顺序（默认）

**禁止**一上来就对新主题满血 implement。默认顺序：

### 1. 读方位与上一刀交接包

- `AGENTS.md` · `CONTEXT.md` · `docs/agents/merge.md`  
- 上一刀：`.scratch/<prev>/spec.md`、issues Status、**`app/.progress/<prev>-*.md`**（impl / closeout / review）  
- 可选：上一会话 `/handoff` 文件  

### 2. 验收上一刀（handoff-based intake）

对照交接文档做 **轻量验收**，不是重做实现，也不是替代人远程合并：

| 检查 | 做法 |
|---|---|
| 分支 / 合并状态 | `git fetch`；`feat/<prev>` 是否已进 `main`（人合并；未合则记录，不擅自 push main） |
| 证据是否对得上 | typecheck 命令、smoke 断言、手验清单是否可复核 |
| Spec / 票 vs 声称完成 | 抽 2～3 条 acceptance；明显缺口写入「上一刀债」 |
| 安全 | 无密钥、无误提交 `wiki/` `*.db` |

**产出（短写即可）：**

- `app/.progress/<prev>-intake.md`，或  
- 在上一刀 closeout/impl 的 `## Comments` 下追加「下一 Owner 验收：通过 / 有条件通过 / 需返工」  

| 结论 | 下一步 |
|---|---|
| **通过** | 进入本会话下一刀 brainstorm |
| **有条件通过** | 记下债；**默认仍开下一刀**（除非人要求先修） |
| **需返工** | 本会话优先修上一刀（同 `feat/*` 或 hotfix 分支），**推迟**下一刀 brainstorm |

人已声明「我自己合 / 已合」时：合并动作不重复做，仍要做 **文档与证据验收**。

### 3. 再开下一刀 brainstorm（短对齐）

验收通过或有条件通过后：

1. 读人指定的下一主题；若无主题，据 CONTEXT + 上一刀债 **提 2 个候选等人拍板**（勿擅自开超大刀）  
2. **短对齐**（少量决策）；默认 **不满血** `/grill-with-docs`  
3. 要对齐参考实现 → **调研子代理**，Owner 只收摘要  
4. 需要则 `to-spec` / `to-tickets` → `/implement` → push → 人远程合并  

---

## 启动提示词模板（复制到新会话）

把 `<PREV_SLUG>` / `<NEXT_THEME>` 换成实际值；下一主题未定时写「待我拍板」。

```markdown
你是本仓 **Slice Owner**（见 AGENTS.md §工程模式、docs/agents/workflow.md、docs/agents/slice-handoff.md、docs/agents/merge.md、ADR 0001/0002）。

## 硬顺序（不要跳）
1) **交接验收上一刀** `<PREV_SLUG>`  
2) 写出通过 / 有条件通过 / 需返工  
3) 仅 1–2 通过后，再 **短对齐 brainstorm 下一刀**：`<NEXT_THEME>`  
4) 再 spec/tickets（若需要）→ implement → push feat/*  

## 上一刀交接包（必读）
- `.scratch/<PREV_SLUG>/spec.md` 与 issues
- `app/.progress/<PREV_SLUG>-*.md`（impl / closeout / review）
- CONTEXT.md 当前方位
- git：fetch 后看 `main` 与 `feat/<PREV_SLUG>` 是否已合（人负责远程合并；禁止 push main）

## 验收上一刀时
- 核对证据（typecheck/smoke/手验）与 ticket 声称
- 抽查 spec acceptance；记录债与风险
- 写短 intake：`app/.progress/<PREV_SLUG>-intake.md` 或在进度文件 Comments 追加结论
- 需返工 → 先修上一刀；不要并行大开下一刀

## 下一刀 brainstorm（验收后再做）
- 短对齐，默认不满血 grill-with-docs
- 「去调研 / 对齐参考」→ 派调研子代理，你只收摘要
- 产品立场：真实产品日常价值，非答辩清单

## 合码
- push `feat/<slug>` → CI + 分支 review → 人远程合并
- 不以开 PR 为必做步骤

先从 **git 状态 + 上一刀交接包** 开始，报告验收结论，再等/进入下一刀对齐。
```

### 当前仓库填空示例（run-observability 之后）

- `<PREV_SLUG>` = `run-observability`  
- 交接包：`.scratch/run-observability/`、`app/.progress/run-observability-impl-1.md`  
- `<NEXT_THEME>` = 你指定的下一产品主题（或「提案 2 个候选」）  

---

## 与 `/handoff` 技能

- **`/handoff`**：任意时刻压缩**当前会话**给下一窗（续作或中断）。  
- **本页 closeout / intake**：跨刀的 **关刀 + 验上一刀** 约定；可与 `/handoff` 并用，不互相替代。
