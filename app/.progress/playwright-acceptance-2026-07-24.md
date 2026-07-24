# Playwright 端到端 (E2E) 验证关刀记录

**验证日期:** 2026-07-24  
**验证工具:** `playwright-cli`  
**Web 服务 URL:** `http://localhost:3000`  
**Server 服务 URL:** `http://localhost:3001`  
**结果:** ✅ **全部 5 大核心场景页面及 API 端点端到端巡检通过**

---

## 1. 验证的页面与页面快照清单

| 页面路由 | 场景描述 | 页面 Title | 验证结果 | 页面快照 (Snapshot) |
|---|---|---|:---:|---|
| `http://localhost:3000/` | 看板页 (7列、指派、卡片、状态) | `毕设 Multi-Agent` | ✅ PASS | `.playwright-cli\page-2026-07-24T03-02-51-669Z.yml` |
| `http://localhost:3000/inbox` | 收件箱 (双栏列表、已读/未读、通知详情) | `毕设 Multi-Agent` | ✅ PASS | `.playwright-cli\page-2026-07-24T03-03-04-216Z.yml` |
| `http://localhost:3000/chat` | Chat 多轮对话 (Thread 列表、消息泡、输入框) | `毕设 Multi-Agent` | ✅ PASS | `.playwright-cli\page-2026-07-24T03-03-10-907Z.yml` |
| `http://localhost:3000/projects` | Projects 容器 (项目列表、Git status 探针) | `毕设 Multi-Agent` | ✅ PASS | `.playwright-cli\page-2026-07-24T03-03-16-907Z.yml` |
| `http://localhost:3000/settings` | Settings 诊断 (Live Runtime Probes 活体探针) | `毕设 Multi-Agent` | ✅ PASS | `.playwright-cli\page-2026-07-24T03-03-22-756Z.yml` |

---

## 2. API 与后端探针验证

- `GET http://localhost:3001/api/settings/live-probes` 正常响应。
- PID 探针与 activeRuns 心跳检测机制正常。

---

## 3. 验收结论

项目所有核心切片功能经 `playwright-cli` 自动化交互验证，DOM 渲染、页面跳转、控制台连接均无阻断性 Error，E2E 端到端巡检全绿通过。
