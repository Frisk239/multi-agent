# page-actions-simplify-impl-1

## 主题
集合页右上角按钮密度对齐 Multica：顶栏只留主 CTA（+ 可选「更多」），跨页次要入口不并列成一排 ghost。

## Multica 对照（Playwright 真站）
- `/agents`：顶栏几乎只有 **新建智能体**
- `/squads`：只有 **新建小队**
- `/skills`：主 **新建 skill**（本仓本地真源改为 **导入** 为主 CTA，扫描进更多）

## 实现
- 新增 `PageHeaderMore`（原生 details 菜单）+ CSS
- Agents / Squads / Skills / Wiki / Memory / Automation / Runs / Usage / ProjectDetail 顶栏收口
- 保留 testid（`agents-to-runtimes` 等）在更多菜单内

## 验收
- typecheck web green
- local `/agents`：`更多` + `新建智能体`；展开含 本机 CLI / 环境诊断 / 聊天 / Skills
- `/squads`：`更多` + `新建小队`；`/skills`：`更多` + `导入`；`/wiki`：`更多` + `问答`

## 决策
- 侧栏已有导航的跨页链不占顶栏；主 CTA 对齐 Multica 创建/导入语义
- Skills：本仓无云端「新建 skill」，主 CTA = 导入；重新扫描放更多

## 下一刀建议
- Inbox 运维仍可折叠；Helper / CmdK 是否暴露同等快捷入口
- Grok ACP 完整化、Skills URL/ClawHub（既有债）
