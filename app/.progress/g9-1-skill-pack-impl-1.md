# Closeout: G9-1 Builtin 方法论 skill pack

日期：2026-08-19  
Slug：`g9-1-skill-pack`

## 交付

新增 4 个 builtin skill（不改 runtime / 不强制挂载）：

- `ma-planning` · `ma-code-review` · `ma-testing` · `ma-closeout`

路径：`app/packages/server/src/skill/builtin/<name>/SKILL.md`

挂载：Skills 页扫描即可见；agent 按现有 skill 绑定方式选用。不要默认全挂。

## 证据

- e2e（本会话先跑）：G7 17/17 + 巡检 6/6 PASS（隔离 `e2e-playwright.db`）
- `scanner.builtin.test.ts` + `scanner.test.ts`：28 passed

## 债

未跑 Skills 页 Playwright（本机服仍在可手点 `/skills`）。
