# 执行者 Kickoff · G8-3 旧密钥清库 + envRef 缺值 fail-closed + 备份诚实

---

## 启动提示词（复制从下一行开始）

```
你是本仓实现执行者。工作区：multi-agent 仓库根。

## 铁律
- ADR 0003 / AGENTS：密钥不落库、不在 UI 回填 secret。
- 清理旧数据必须可 dry-run；apply 要可测、可文档说明；避免误删非敏感配置。
- 不引入云 vault。

## 本刀：G8-3 · 密钥清库 + envRef 缺值 + 备份诚实
规格：`.scratch/g8-trust-execution/spec.md` §G8-3  
参照：`app/.progress/hard-gap-audit-2026-08-08.md` 审计后落地段 + 文末「旧库清理」

### 现状（已有，勿重做）
- 新写入：`agent-config.ts` / `mcp-config.ts` envRef + fail-closed
- 执行：`agent-inject.ts` 跳过敏感明文
- API：`reshape` / `redactMcpConfig` 脱敏

### Must
1. **遗留扫描 + 清理**
   - 提供运维入口之一：`ma` CLI 子命令 或 server ops 路由（需鉴权/local-token 惯例一致）。
   - dry-run：报告 agents 中 env_vars / mcp_servers 仍含敏感字面量的条目（agent id、key 名、**不打印完整 secret**，可指纹前缀）。
   - apply：将敏感字面量改为 envRef 占位（若 value 像 env 名可提示；否则清空 value 并标记需用户设 envRef）或安全清空，使 DB 文件不再存该明文；执行路径仍不注入旧明文。
2. **envRef 缺值 fail-closed**
   - 敏感 key 配置了 envRef 但 `process.env[ref]` 缺失：run 应失败并带明确错误（「宿主环境缺少 FOO」），禁止静默缺省导致 auth 类糊墙。
   - 非敏感可 warn；与 `agent-inject.ts` 行为对齐并补测。
3. **备份诚实**
   - `ops-backup` 整库备份：元数据或日志/响应字段注明「可能含历史明文，清理后再备份更安全」；可选 scrub 模式为加分非必须。
4. 单测：扫描 dry-run、apply 后无明文、envRef 缺失 fail、新写 400 仍成立。

### Out
- UI 展示真实 secret
- 自动猜测并写入错误的 env 名而不经确认
- 改 Issue JSON 导出（无关）

### 建议触摸
- `agent-inject.ts` + test
- `agent-config.ts` / `mcp-config.ts`（复用敏感 key 判定）
- `ops-backup.ts` / routes ops
- `cli/ma.ts` 或 routes
- roster 勿回退为可存明文

### 验收自测
- [ ] 构造 `API_TOKEN=sk-test-xxx` 旧行 → apply 后 DB 无该串；API 仍不回显
- [ ] envRef=MISSING_VAR → run/注入路径明确失败
- [ ] server tests 绿

### 回报
文件列表、CLI/API 用法、测试结果、用户迁移说明草稿（3–5 行中文）。
```

---

## 计划者验收清单（G8-3）

- [ ] dry-run / apply 存在且不泄漏完整 secret 到日志  
- [ ] envRef 缺失 fail-closed  
- [ ] 备份有诚实提示  
- [ ] 测试证据  
