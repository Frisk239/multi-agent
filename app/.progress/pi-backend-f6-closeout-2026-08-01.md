# 下一刀波次 closeout · 2026-08-01（B1 Pi backend + F6 列表页 IA）

> **分支：** feat/issue-workbench · **模式：** Slice Owner 自动迭代（/goal 自动计划+审核+开刀）
> **Intake：** [hard-gap-close-wave-closeout-2026-08-01](./hard-gap-close-wave-closeout-2026-08-01.md) 遗留建议 → 选 B1（中危产品面误导）+ F6（顺手项）

## 完成清单（2 commit 全 push）

| 刀 | commit | 内容 | 验收证据 |
|---|---|---|---|
| B1 | `88f7d72` | **Pi runtime 真 backend**：pi.ts 由诚实 stub → 真执行（~500 行）。spawn `pi --mode rpc`（可选 `--session-id` 恢复、cwd 透传、`.cmd` shim `shell:true`）；stdin JSONL 命令（get_state/prompt/abort）；stdout 三通道 demux（response 按 id resolve / extension_ui_request 忽略 / AgentSessionEvent 事件流）；**agent_end(willRetry=false) 唯一完成点**；message_delta/message/tool_start/tool_end 事件映射；usage 求和（cost 无落库列不入库）；abort/超时 killProcessTree + 5s 兜底；启动即退/脏帧/CRLF 全防御。runtime-capture 更新（usage/tool/providerSessionId 全 true）；registry/session-resume 能力翻转自动生效 | pi.test **11 条** mock spawn 场景全过（happy path/分块帧/preflight 失败/abort/resume/启动即退+5 补充）；server 全量 **674 全绿**（子代理跑）+ 我复核 runtime 组 39/39；`app/` 三包 typecheck 绿 |
| F6 | `24cb4eb` | 列表页二级 IA：SquadsPage「全部/我的」Tab（`?scope=` 深链，我的=leaderId 匹配）+ 成员列「N 名成员」样式；SkillsPage 排序 Select（`?sort=updated`） | 浏览器实测：小队 Tab 切换 → `?scope=mine`；Skills 切「最近更新」→ `?sort=updated`；web 全量 **418 全绿**（子代理跑）+ typecheck 绿 |

## 调研沉淀（供后续参考）

- **pi RPC 协议规格**（探索子代理产出，实测行号）：spawn `pi --mode rpc`；JSONL 帧 LF-only split 禁用 readline（U+2028/2029 陷阱）；`prompt` 的 success response 早于完成（preflight 通过即回），**agent_end 才是完成点**；`--session-id` 按精确 id 恢复；usage 在 message_end/agent_end 的 assistant message 上；cost 无落库列。蓝图：`references/repos/pi/packages/orchestrator/src/rpc-process.ts` + `packages/coding-agent/src/modes/rpc/rpc-mode.ts`。

## Remaining / 下一刀建议

- **真机验收 Pi backend**：本机无 pi CLI（探测失败），协议正确性由 mock spawn 测试覆盖；装了 `pi` 后应做一次真机 e2e（派一个 pi agent 跑一条 issue）
- F6 数据面欠账：`GET /api/squads` 不下发 memberIds → 「我的」Tab 按 leaderId 匹配、成员列无法头像堆叠（server 补 memberIds 后前端可点亮）；`GET /api/skills` 无 updatedAt → 排序 name 兜底（补字段即生效）
- B1 可后置：`listRuntimeModels` 的 pi 模型列表端点
- 主线 reopenable-db-lifecycle D1-D5（独立会话）

## 关刀规范核对

- ✅ 每刀 vitest + typecheck（app/ 三包）；浏览器交互验收（F6 两页）；B1 由 mock spawn 单测覆盖（真机待装 pi 后补）
- ✅ Conventional Commits（feat ×2）
- ✅ 未 commit `wiki/` `*.db` 运行产物；未碰 references/repos/
- ⚠️ 仓库根 `pnpm -r typecheck` 会扫 references/repos/*（60 个只读 clone 未装依赖）→ 既有环境问题，验收一律用 `app/` 工作区
