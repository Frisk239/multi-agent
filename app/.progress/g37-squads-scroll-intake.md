# Intake: g37-squads-scroll

日期：2026-08-19
上一刀提交：`a148d27 feat(web): /squads 进详情再返回锚定刚打开的行`

## Verdict：有条件通过

- 合并状态：`a148d27` 已是 `main` / `origin/main` 的 HEAD。
- 抽检路径：打开 `/squads` 中 `sqd-product`，进入详情后浏览器后退；`data-restored="1"`，位置恢复断言通过。
- 复核证据：`pnpm typecheck` 通过；`cd app/packages/server && pnpm e2e --filter g37-squads-scroll` 通过（1 PASS / 0 FAIL / 0 SKIP）。相邻的 Runs、Agents、Skills 三个同波路径也各为 1 PASS / 0 FAIL / 0 SKIP。
- 安全：该提交未带入 `wiki/`、数据库或密钥。工作树中的 `.memory/`、`.zcode/` 是既有未跟踪内容，本次未触碰。

## 非阻断记录

- 原 closeout 未写完整的 SHA/全量检查命令；本 intake 已补足本次可复核的最小证据。功能无需返工。
- 当前四个列表的 E2E 均只验证 `data-restored="1"`，目标行在短列表里本来可见，尚未证明真实视口滚动恢复；`useListAnchor` / Runs 在锚定条目被筛掉时也尚未回退到记录的行序号。该债不阻断本次切换主题，但应进入前端 UX 候选池。

## 下一步

- 基于参考项目与本仓后端/前端 UX 差距，选择一个新的厚垂直切片；不重开已完成的列表锚定波。
