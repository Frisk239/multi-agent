# G4-2 流式围栏 scrubber closeout（2026-08-02）

> Goal G4 知识/记忆 · roadmap §4 队列（小成本刀）。状态：**已关 ✅**

## 目标

prompt 注入的围栏（`<retrieved-context>`/`<context-fence>`/`<think>`）无剥离侧——CLI 回显 user prompt 时会把系统注入内容漏进 UI 与回放。学 hermes `StreamingContextScrubber`（memory_manager.py:171）：跨流 chunk 有状态剥离。

## 关键事实（探索）

- 本仓围栏：`<retrieved-context kind=...>`（prompt.ts:177 wrapRetrievedContext）+ `<context-fence kind="memory">`（manager.ts:43 formatMemoryContextBlock 原生标签，装配时再包一层 retrieved-context）+ `<think>`
- 泄漏路径：CLI（pi 等）回显完整 prompt → run-worker onEvent message_delta/message → UI/回放
- 一次性正则无法跨 chunk 边界（hermes memory_manager.py:174-179 明言状态机必要性）

## 实现

| 文件 | 改动 |
|---|---|
| `runtime/stream-scrubber.ts`（新） | `StreamScrubber` 有状态状态机（feed/flush/reset）：跨 chunk 持有可能的部分标签尾部；块边界保护（围栏须在行首 + 标签后跟换行，防正文误剥）；未闭合 span 在 flush 时整体丢弃（漏半截围栏比截断回答更糟，hermes 同语义）；`scrubFences(text)` 一次性剥离（整条消息） |
| `orchestration/run-worker.ts` | per-run `StreamScrubber`；onEvent `message_delta` → `scrubber.feed()`（被剥内容不发布 run:progress/stream_chunk）；`message` → `scrubFences()`（user 回显整条剥净）；execute 完成后 `flush()` 发布残留；log 事件不剥（stderr 调试信息，防误伤） |
| `runtime/stream-scrubber.test.ts`（新） | 9 用例：单 chunk 各标签 / 跨 chunk 开标签与闭标签切分 / 未闭合丢弃 / 部分标签尾部 flush 放出 / 块边界防误剥 / 多围栏连续 / **user 回显完整 prompt 剥净** |

## 真机验收（决定性证据链）

1. 跑 pi issue（描述命中记忆库「噪声记忆条目 99」）
2. **pi session 文件**（`~/.pi/agent/sessions/...jsonl`，pi 收到的原始 prompt）：包含 `<context-fence kind="memory" title="Memory Context">` —— **memory 注入真实发生**
3. **落库 user 回显**（run messages）：无 `context-fence`/`retrieved-context`/`<think>`、无记忆正文泄漏（「参考数据/非用户指令/id=」均无）—— **scrubber 在事件层正确剥离**（注入→回显→剥离全链路闭环）

## 门禁

- server 全量 **712 passed**（0 FAIL，含 scrubber 9 新用例）；web 424；typecheck 全仓绿
- 无 schema/迁移/shared 改动

## 决策与边界

- **log 事件不剥**：stderr 调试输出走 thinking 通道，围栏出现概率低且形态不同；剥 log 有误伤调试信息风险
- **块边界保护**保留（hermes 同款）：行中偶发的 `<think>` 文本不误剥
- **未闭合 span 丢弃**而非透出（防半截围栏泄漏）

## 未做（后续刀）

- G4-4 Memory scope 多维精化 / G4-3 Wiki ingest 无 key 降级诚实化 / G4-5 Wiki 二阶
- `<think>` 块的内容复用（本刀只剥不转 thinking 通道——保持简单）
