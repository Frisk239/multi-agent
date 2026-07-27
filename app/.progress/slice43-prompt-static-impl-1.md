# Slice 43 · Prompt 静态化（D6）· closeout

> 2026-07-27 · impl-1 · 不 commit

## 交付

| 路径 | 内容 |
|---|---|
| `app/packages/server/src/runtime/prompt.ts` | `PromptParts { staticSystem; dynamicUser }`；`assembleIssuePromptParts` / `buildStaticSystemParts` / `buildDynamicUserParts` / `composePrompt` / `joinPromptSections`；`buildPromptParts` 解析 DB 后固定组装；`buildPrompt`/`resolveRunPrompt` 仍返回 CLI 单字符串 |
| `app/packages/server/src/runtime/prompt.test.ts` | 同一 agent 两次不同 memory → static 前缀相等、dynamic 不同 |
| 既有围栏 | slice7 `<retrieved-context>` / `boundary-fence` / `PROMPT_PART_SEPARATOR=\n\n---\n\n` 保留 |

## 边界（Must）

| 区 | 内容 |
|---|---|
| **staticSystem** | skills · About · Agent Instructions · boundary-fence · Squad Operating Protocol + Roster |
| **dynamicUser** | Mission Directive（per-run）· issue body/comments/cwd · wiki retrieved-context · repo-context note · memory retrieved-context |

固定顺序：`staticSystem` → `dynamicUser`（节内再用 `---` 分隔）。

## Must 勾选

1. ✅ 清晰 static/dynamic 边界（类型 + 组装函数）
2. ✅ Memory / issue / comments / wiki → dynamic；instructions / skills / boundary / squad protocol → static；mission → dynamic
3. ✅ 单测：换 memory 不改 static 前缀
4. ✅ 密钥模型不改；CLI 仍收拼接后单 prompt
5. ✅ closeout 本文件
6. ✅ typecheck + vitest（见下方证据）

## Out

- 全 provider token-level cache 保证
- 跨 CLI session 迁移
- 自造 agent loop / 密钥进 prompt 落库
- 未改 `references/repos`

## 证据

```text
cd app/packages/server
pnpm exec tsc --noEmit          # EXIT 0
pnpm exec vitest run src/runtime/prompt.test.ts
# ✓ 5 tests passed
```

## 后续

- 若要 chat/QC 也走 `PromptParts` 结构，可单开小刀（本刀 issue 主路径已齐）
- provider 侧真 cache 命中统计不在本刀
