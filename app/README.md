# 应用代码

毕设平台的**自研实现**放此目录（Phase 0 起）。

建议结构（待定，随技术栈锁定后调整）：

```
app/
├── server/          # API + 编排 + Wiki/Memory 服务
├── web/             # Next.js 控制台
├── agent/           # 内置 runtime（或 adapter 包）
└── docker-compose.yml
```

启动开发前请先读 [../design/architecture.md](../design/architecture.md) 与 [../design/roadmap.md](../design/roadmap.md) Phase 0 交付物。
