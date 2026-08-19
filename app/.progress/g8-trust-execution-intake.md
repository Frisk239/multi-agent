# Intake: G8 可信执行（G8-1…G8-5a）

日期：2026-08-19  
上一刀 slug：`g8-trust-execution`  
裁决人：Slice Owner（本会话）

## Merge / git

- HEAD：`e6ab04f` `feat(web): G7 前端体验第二波全关`，已与 `origin/main` 对齐。
- G8-2 / G8-3 / G8-4a / G8-5a 实现与 closeout **均在工作区未提交**（大量混杂 WIP，closeout 明确禁止混合提交）。
- 未 push。不在本 intake 提交。

## Evidence 抽查

| 切片 | closeout | 工作区痕迹 | 抽查结论 |
|---|---|---|---|
| G8-1 看板 waiting | spec 标计划者验收 08-10 | **仅工作区**（`KanbanBoard` / `issue-card-live` 未进 e6ab04f） | 有条件通过 |
| G8-2 execution ownership | `g8-execution-ownership-impl-1.md` | `execution-ownership.ts` + `0053_run_execution_owner.sql` | 文件在，待独立提交 |
| G8-3 secret safety | `g8-secret-safety-impl-1.md` | `secret-safety.ts` + Settings 扫描 UI | 文件在，待独立提交 |
| G8-4a preflight honesty | `g8-preflight-readiness-impl-1.md` | `runtime/preflight.ts` + capability UI | 文件在；**无生产 adapter 真 probe** |
| G8-5a transcript scrub | `g8-transcript-scrub-impl-1.md` | `runtime/secret-scrubber.ts` | 文件在，待独立提交 |
| G8-6 长轨迹 UX | spec ⬜ | kickoff 已写 | **未开** |

未在本 intake 重跑全量测试（工作区混杂、closeout 已各自报绿）。债务：未 commit、未 migrate 默认 `dev.db`、G8-4b 仍禁开。

## Spec vs claim

对照 `.scratch/g8-trust-execution/spec.md`：Must 中 G8-1…G8-5 已落地；G8-6 三条（锚定最新 / 更早文案 / Subagent 树 isError）未做。禁区未踩。

## Safety

未见密钥入库 UI；G8-3 明确 fail-closed envRef。未把 `*.db` / `wiki/` 纳入待提交。

## 裁决

**有条件通过。**

条件 / 债：

1. G8-2…G8-5a 须按刀独立 commit，禁止与其它 WIP 混提。
2. 合入后须 `pnpm --filter @ma/server db:migrate`（`0052`/`0053`）。
3. G8-4b 仍等一手无副作用 probe 证据，不得为绿灯开刀。
4. 本会话先做对照 references 的新缺口调研，再短对齐下一厚刀（默认候选 G8-6，可被更高价值缺口替换）。
