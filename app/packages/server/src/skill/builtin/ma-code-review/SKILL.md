---
name: ma-code-review
description: 按本仓宪法审 diff：能力是否诚实、有无密钥、有无假装生效的配置。
---

# 代码审查清单（本地编排）

审查目标是「控制台声明 = 真实行为」，不是风格吹毛求疵。

## 必看

1. **宪法钉**：有没有自造 agent loop、把密钥写入 DB/UI、改 `references/repos/`。
2. **能力诚实**：MCP / customArgs / thinking / resume 是否只在 adapter 真消费时开放；禁止静默 no-op。
3. **失败可读**：失败是否有 `failureReason` / 人能采取的下一步，而不是只丢 raw stderr。
4. **测试**：改了决策边界就要有 vitest；不要删测来过门。

## 输出格式

- **blocking**：必须改（安全、撒谎、破主路径）
- **nits**：可随后改
- **疑问**：需要作者说明

## 不要

- 不要要求上云、Redis、多节点。
- 不要把「没做 TipTap / Wiki 图谱」当成缺陷。
