# G1-2 Grok ACP/fail-closed closeout（2026-08-02）

> Goal G1 执行层诚实性 · roadmap §4 队列第 4 刀（产品误导项，诚实性优先）。状态：**已关 ✅（fail-closed 基线；ACP 客户端另立后续刀）**

## 目标与决策

roadmap G1-2 两个选项：「补 ACP stdio 客户端」或「摘除 supportsSessionResume 声明 + UI 标注降级」。**探索发现现状比基线描述更糟**——`-p`/`--resume` 是 grok **顶层** flag（`-p` 即 `--single <PROMPT>` 别名，prompt 必须紧跟其后），旧实现 `grok agent --always-approve -p <prompt>` 在本机 grok 0.2.118 上 **100% 失败**（tryPrintMode 与 fallback 全断）。且 A9 的 `supportsSessionResume=true` 声明在 UI/Settings/测试矩阵三处扩散。

**拍板：先 B（fail-closed 基线，成本约 A 的 1/10）后 A（ACP 客户端独立刀，Multica grok.go 蓝图已在仓内 + 本机 `grok agent stdio` 握手实测通过）。** 落地前不声明 ACP。

## 改动

| 文件 | 改动 |
|---|---|
| `runtime/grok.ts` | `supportsSessionResume=false`（注释诚实化）；`buildGrokAgentArgs` 改为顶层形态 `grok --no-auto-update [-p <prompt>] [--model] [--effort]`（prompt 紧跟 -p）；fallback 降级为无 model/effort 的 `-p <prompt>`；`parseGrokLine` 纯文本行由 log 改为 **assistant message**（G1-2：grok 回复此前永不落库，run 详情看不到产出） |
| `routes/settings.ts` | grok 能力文案删假声明「ACP JSON-RPC Stdio」（实际未实现），保留诚实的 Print Mode / Effort；`supportsSessionResume` 追加逻辑因 false 不再出现 Session Resume |
| `web RunDetailPage.tsx` | resume 支持名单移除 Grok：「claude-code / opencode / cursor 支持真 session resume；Grok（单轮打印模式）与 Pi 暂不支持」 |
| 测试矩阵（5 处） | `session-resume.test.ts` / `registry.test.ts` / `runtime-capture.test.ts` 期望 grok=false（A9 残留）；`cliequalization.test.ts` 重写 grok args 断言（顶层形态 + 不注入 --resume）+ 新增 parseGrokLine 纯文本→message 用例；`e2e-slice50-session-resume.mts` 头注释统一（脚本主体早已是 fail-closed 期望） |

## 真机验收（本机 grok 0.2.118）

1. **修复前**：grok run 100% 失败（`unexpected argument '-p'` / `unrecognized subcommand`）
2. **修复后**：grok agent（新建，runtime=grok）派活 → run **completed**，messages 落库 assistant「跑通了。」✅（此前回复永不落库）
3. 手工验证正确形态：`grok --no-auto-update -p "只用两个字回答：通了" --model grok-4.5` → 「通了」exit 0
4. `GET /api/settings/diagnostics` grok capabilities = `['Print Mode (-p)', 'Effort Level Control']`（无假 ACP/Resume）✅
5. Settings UI 无任何 ACP/Session Resume 假声明（Playwright）✅
6. ACP 入口实测：`grok agent stdio` initialize 握手成功（protocolVersion 1、loadSession:true、authMethods: cached_token/grok.com）——为 A 刀铺路 ✅

## 门禁

- `pnpm typecheck` 全仓绿；server 全量 695 passed；web 全量 424 passed
- 新增/更新用例：cliequalization grok args + parseGrokLine（2），矩阵类 3 处更新

## 未做（后续刀）

- **ACP stdio 客户端（G1-2 A 分支）**：port Multica hermesClient/grok.go（仓内可读），接 `grok agent stdio`（initialize/authenticate/session/new/session/prompt），含 mock ACP server 测试；落地后恢复 `supportsSessionResume=true` + Settings 声明。可复用 G1-1 的 `sendRunCommand` 接口。
- grok print 模式无 usage/token 落库（print 输出无结构化 usage；ACP 后才有）
