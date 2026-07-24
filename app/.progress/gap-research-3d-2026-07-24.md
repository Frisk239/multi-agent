# 三维度项目差距调研 · 2026-07-24

**调研方式:** Owner 全量读取项目代码 + 4 个 deep reads + 已有 gap 分析 + 12 个参考项目源码  
**范围:** 功能完备性 · 使用体验 · 架构技术深度  
**对比基线:** Multica 真站/源码 · Hermes · Pi · agents.md · gstack · OpenDeepWiki · openwiki · mem0 · graphiti

## 总结

**主航道已全覆盖（~90%），差距在两个系统性方向：核心工作流深度 + 知识层智能化。**

### 🔴 P0（核心工作流深度）

| ID | 缺口 | 参考 | 本仓根因 |
|---|---|---|---|
| FC-1 | Chat 多轮 history 注入 | Multica `daemon.go:2647+ trailingUserMessages` | `prompt.ts` chat 只拼 `quickPrompt` |
| FC-2 | Per-project local path | Multica `execenv.go:250` / `local_directory.go:16` | `resolve-run-cwd.ts` 一律 workspace root |

### 🟡 P1（高价值）

| ID | 缺口 | 参考 |
|---|---|---|
| FC-3 | Issue idle/tool/wall timeout 分层 | Multica `config.go:24-60` |
| FC-4 | Enqueue 可观测 + 结构化反馈 | Multica `agent_ready.go:9-42` |
| ARCH-1 | Memory 向量检索自动接入 prompt | Hermes `prefetch()` |
| ARCH-3 | Runtime Backend 统一事件协议 | Pi `AgentMessage` / Multica `TaskMessagePayload` |
| UX-1 | 实时流式反馈偏弱 | — |

### 🟢 P2（纵深）

FC-5 Activity Log · FC-6 Delegate 子代理 · FC-7 Tool Registry · FC-8 Context Compression · ARCH-2 Memory hooks · ARCH-4 Wiki per-project 交叉索引 · ARCH-5 Session 持久化 · UX-2/5/6/7/8/9 体验细节

### ✅ 超车保持

Wiki 编译+query · Memory 双后端+批量 · Settings 健康卡矩阵 · Runs Mission Control · CmdK · Git 脏目录探针 · 失败深链网

## 下一步建议

| 序 | 切片 | 复杂度 | 可 demo |
|---|---|---|---|
| 1 | Chat 多轮 history → prompt | 低 | 同 thread 连续问不失忆 |
| 2 | Project localPath → issue cwd | 中 | issue 绑项目→agent 在对的目录 |
| 3 | Enqueue 返回 reason + toast/inbox | 低 | 指派失败有明确反馈 |
| 4 | Issue idle timeout (30min default) | 低 | 长工具不被误杀 |
| 5 | RuntimeEvent 标准协议 + 流式渲染 | 中 | 看到 agent 实时干活 |

**完整报告:** 调研会话 artifact `gap-research-2026-07-24.md`
