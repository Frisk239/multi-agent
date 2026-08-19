# 执行者 Kickoff · G8-5 Transcript / 日志密钥 scrub

---

## 启动提示词（复制从下一行开始）

```
你是本仓实现执行者。工作区：multi-agent 仓库根。

## 铁律
- 只做高置信 secret pattern，避免误伤正常代码（如无脑替换所有 sk）。
- 与现有 `stream-scrubber.ts`（memory/think 围栏）并列，勿混为一谈。
- 性能：消息分页路径保持线性。

## 本刀：G8-5 · Transcript secret scrub
规格：`.scratch/g8-trust-execution/spec.md` §G8-5

### Must
1. 在 run 消息**持久化**与（若同源）**WS 广播**前，对文本做 secret scrub：
   - 例：Bearer token、常见 `sk-`/`sk-or-` 前缀长 token、`AKIA...`、明显 `api_key=...` 赋值等（列清单在代码注释）。
   - 替换为稳定占位如 `[redacted]`。
2. 覆盖流式 partial 合并后的最终落库路径；跨 chunk 若困难，至少保证 final message 落库被 scrub。
3. 单测：含假 secret 的内容 → DB/API 不可读原文。
4. 文档：在模块头注释说明「非密码学保证，防 CLI 回显」.

### Out
- 通用 PII（邮箱电话全抹）除非顺手极小
- 改前端展示逻辑大翻修（API 已 scrub 即可）
- 密钥清库（G8-3 负责）

### 建议触摸
- 新建 `runtime/secret-scrubber.ts` 或 `orchestration/` 旁纯函数
- run-worker / activity-logger / messages 写入点
- 对标 `stream-scrubber.ts` 测试风格

### 验收自测
- [ ] 单测绿
- [ ] 不影响正常代码块中的短 `sk` 误伤策略有说明
- [ ] typecheck 绿

### 回报
pattern 列表、接入点、测试命令与结果。
```

---

## 计划者验收清单（G8-5）

- [ ] 落库路径接入 scrub  
- [ ] 测试证明 redacted  
- [ ] 无严重误伤策略说明  
