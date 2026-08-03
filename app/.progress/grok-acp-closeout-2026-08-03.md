# G1-2 Grok ACP stdio 客户端 — closeout（2026-08-03）

> 从「单轮 print 降级」到「真实会话 + usage 落库」；G1–G5 池最后一块拼图（B-01 CLI 适配器均衡的剩余短板）正式收官。

## 验收标准对照（全部满足）

| 验收项 | 结果 | 证据 |
|---|---|---|
| grok run 走 ACP 通道完成（非 print 降级；run 详情可分辨） | ✅ | 真机回合 1：fresh 会话产出「记住了42」（流式 message 落库）；`supportsSessionResume=true` + Settings 能力「ACP Stdio (JSON-RPC)」 |
| 多轮会话可续：resume 后上下文延续 | ✅ | 真机回合 2：`sessionResumeStatus=resumed` + 同一 session id（019fc555…）+ 新 turn 问「记住的数字」答「42」；cacheRead 14080（resume 缓存命中） |
| usage/token 结构化落库（非估算兜底） | ✅ | 真机：回合 1 tokensInput=13578/output=324/cacheRead=192；回合 2 input=478/output=593/cacheRead=14080（全部来自 ACP 响应 `_meta.usage`，含 totalTokens 判定的 cached 剥离） |
| `supportsSessionResume=true` 声明真实（Settings/矩阵/UI 一致） | ✅ | grok.ts `supportsSessionResume=true`；Settings 诊断 API 真机返回 capabilities 含「Session Resume (--resume)」；session-resume/registry/runtime-capture 矩阵测试同步 |
| 失败诚实：未登录/认证失败/会话超限 → 可分类 + 可行动提示 | ✅ | 单测：无 authMethods/仅 grok.com/authenticate 错误 → 「认证失败 + 请运行 grok login」；resume 会话丢失 → 清 id（worker 记 resume_miss）+ 诚实错误；stderr 终端 429 → completed 提升 failed（不误判瞬时警告）；通用失败并入 stderr 线索（如上游 Settings fetch failed） |
| mock ACP server 测试网覆盖协议状态机（契约级，不依赖真机） | ✅ | `runtime/mock-acp-server.ts`（假子进程 + 脚本化服务器角色，行分隔 JSON 线协议）；acp-transport.test.ts 33/33 + grok.test.ts 18/18（协议状态机全链路：initialize→authenticate→session/new|load→set_model→prompt→drain→失败/中止/超时） |
| typecheck 绿 + 每刀有测试 + Playwright 证据 + 全量 pnpm test 绿（含 shared）+ main 已推送 | ✅ | `pnpm typecheck` 全绿；server 889/889 · web 442/442 · shared 全绿；Playwright 7/7 PASS（证据见 .scratch/grok-acp/evidence/）；main 已推送（ea13f22 + 本 closeout） |

## 真机验收记录（本机 grok 0.2.118）

环境：独立验收 DB（`e2e-grok-acp.db`）+ server `:3011` + web `:3000`（NEXT_PUBLIC_API_URL 指向验收 API）。

| 步骤 | 结果 |
|---|---|
| 建 agent（runtime=grok）→ 建 issue「记住数字 42」派活 | 201 + enqueue queued |
| 回合 1（fresh）：`/api/runs/76a02456…` | **completed**；providerSessionId=019fc555-7e83-7fd1-b8bb-5f3ae60ecffc；usage input 13578 / output 324 / cacheRead 192；消息：记 / 住了 / 42 |
| 回合 2（resume）：改 description 为「我刚才让你记住的数字是什么？只回复那个数字本身。」→ rerun | **completed**；`sessionResumeStatus=resumed` + `resumedSessionId` 同 019fc555…；消息：**42**（上下文延续 ✓）；usage input 478 / output 593 / **cacheRead 14080**（resume 缓存命中结构性证据） |
| Settings 诊断 API | grok: installed=true, version 0.2.118, capabilities=[ACP Stdio (JSON-RPC), Streaming Events, Token Usage Tracking, Session Resume (--resume)] |

**真机波折**：验收中途 x.ai 网络抖动（grok.exe 卡「Settings fetch failed」→ initialize 30s 超时，run 诚实失败并带明确错误）；恢复后重跑即绿。这本身验证了失败诚实路径（不静默、不误判）。

## Playwright 关刀证据（7/7 PASS，截图 .scratch/grok-acp/evidence/）

| 用例 | 结果 | 断言 |
|---|---|---|
| R1 产出可见（流式块含 42） | PASS | run 详情页渲染 ACP 产出 |
| R1 会话状态=新鲜启动 | PASS | 详情页 sessionResumeLabel |
| R2 产出可见（42） | PASS | resume 后新 turn 产出 |
| R2 会话状态=已复用 CLI 会话（resumed） | PASS | 详情页 sessionResumeLabel |
| Settings grok 能力含 ACP Stdio | PASS | health tab 能力 pill |
| Settings grok 能力含 Session Resume | PASS | health tab 能力 pill |
| Usage 页可见 | PASS | usage-page testid |

## 交付物

- `runtime/acp-transport.ts`（新）：ACP JSON-RPC 2.0 stdio 传输层 —— 行分隔帧（实测钉死）/ request-id 关联 / session/update 归一化（三种序列化形态）/ permission 自动应答 / usage 解析（totalTokens 判定 cached 剥离）/ provider error sniffer / AbortSignal + cancel()/close()
- `runtime/mock-acp-server.ts`（新）：mock ACP server 测试网（假子进程 + 脚本化应答 + 请求序列断言）
- `runtime/grok.ts`（重写）：print 降级 → 完整 ACP 客户端（initialize→authenticate(cached_token)→session/new|load→set_model→prompt→drain→Result）；失败诚实分类；`supportsSessionResume=true`；sendRunCommand 诚实不支持（ACP v1 无 steer 等方法，multica 同）
- 测试：acp-transport.test.ts 33 用例 + grok.test.ts 18 用例 + cliequalization/registry/session-resume/runtime-capture 矩阵更新
- Settings 能力文案：Print Mode (-p) → ACP Stdio (JSON-RPC) + Streaming Events + Token Usage Tracking

## 决策记录（M1 拍板，research.md §5）

1. 传输层新建（spawnLineProcess 不可复用：需交互式 stdin + 请求关联 + 进程存活跨 prompt）
2. 认证只用 cached_token（密钥不落库宪法）；XAI_API_KEY 在 env 且被提供时才用
3. thinking 块 → log 事件（UI 直播 thinking 通道）；message 块 → assistant 落库
4. usage 兜底链：prompt 响应顶层 → `_meta.usage` → `_meta` 平铺 → usage_update（max 累计）
5. session/load 响应无顶层 sessionId → `_meta.sessionId` 兜底（实测钉死）
6. sendRunCommand：ACP v1 无 steer → 诚实返回不支持（记录为已知边界，非假实现）
7. MCP 注入本刀保持 `mcpServers: []`（与 print 现状一致；multica 支持 ACP 注入，留作后续刀）
8. 流式文本按 chunk 落 run_message（与 claude-code 等一致；「记住了42」显示为 记/住了/42 三块——multica 同为 message-per-chunk 语义，合并不在刀内）

## 已知边界（roadmap §5 刻意不做 / 后续刀）

- `set_model` UI 后置（需 get_available_models 接入；后端 session/set_model 已实现且经真机模型绑定测试）
- sendRunCommand steer/compact/set_model 对 grok 返回明确不支持（ACP v1 无对应方法）
- MCP 服务器经 ACP 注入未做（`mcpServers: []`；grok 自身 ~/.grok 本地 MCP 不受影响）
- 模型价表（MA_MODEL_RATES_JSON）配了才显示 cost（对齐全仓 estimateCost 管道；真 token 已落库）

## 测试计数

- server：889/889（新增 51：acp-transport 33 + grok 18）
- web：442/442；shared：全绿；`pnpm typecheck` 三包全绿
