# 执行层参考

> 源码：[repos/hermes-agent/](repos/hermes-agent/) · [repos/pi/](repos/pi/)

## hermes-agent

**定位：** 同一 core 跑 CLI / TUI / 20+ 消息平台 / 桌面。

**架构要点：**
- `run_agent.py` — tool-calling 主循环
- `model_tools.py` + `toolsets.py` — 工具编排
- `gateway/` — 多平台入口
- `plugins/` + `skills/` — 边缘扩展
- `delegate_task` — 子 Agent 并行/后台
- `cron/` — 调度

**两条铁律：**
1. **Prompt cache 不可破坏** — 长对话复用 prefix
2. **Footprint Ladder** — 扩展代码 → CLI+Skill → 插件 → MCP → 核心工具

**Memory：** MemoryProvider 插件（mem0 等），ABC + orchestrator。

**毕设落点：** Agent loop、toolset gate、delegate 子任务；**不做**全量 gateway。

---

## pi

**定位：** 极简可嵌入 Harness（TS monorepo）。

**必抄设计：**
- AgentMessage vs LLM Message 双层 + `convertToLlm`
- 事件驱动 UI
- 扩展优先（子 Agent 故意不做内置）
- 交互 / print / RPC / SDK 四模式

**毕设落点：** 若 runtime 用 TS，或作为 Runtime Adapter 之一；multica 已支持 Pi。
