# Phase-next-wave-2026-07-30 · 全面 UX/运维/工程优化波次

> **目标**：把目前分析中**仍开放的硬缺口**落地（F1/A9/A4/F2/B2/F5/B3/A2 等），不重做已关刀项。
> **北星**：本地 Multica 控制台手感 + 少翻车 + 运维闭环。
> **工程模式**：Slice Owner（子代理实现 + Playwright 关刀 + main 直推）。
> **列表来源**：`improvement-analysis-2026-07-30.md`（A1/A5/A8 已关，剩余 A2/A4/A9/B2/F1/F2/F4/F5/B3 等仍开放）。

## 推荐波次优先级（ROI 排序）

| 优先级 | ID | 主题 | 类型 | Must | 建议厚度 | ROI |
|---|---|---|---|---|---|---|
| **1** | **F1** | 评论粘贴图/附件 | 前端 | 粘贴图片 → markdown embed；512KiB 校验；UI 提示 | 中 | 高（日用痛感） |
| **2** | **A9** | Grok ACP / 能力诚实 | 后端 | supportsSessionResume + `--resume` 注入；UI 隐藏未实现 runtime | 中 | 高（产品价值） |
| **3** | **A4** | 灾备含项目级 Wiki | 后端 | snapshot 打包 `wiki/projects/<id>/…`；manifest 含 coverage report | 低-中 | 高（运维闭环） |
| **4** | **F2** | Issue Sheet 故事线摘要 + 失败主 CTA | 前端 | Sheet 增加 storyline summary + 失败主 CTA | 中 | 高（看板手感） |
| **5** | **F5** | HelperRail 对齐 Chat 关键路径 | 前端 | fail CTA / thread/stream 统一 | 低 | 中 |
| **6** | **B2** | live restore 闸门 | 后端 | stage 已安全；live swap 需 quiesce + rollback journal（A4 之后开） | 高 | 高 |
| **7** | **B3** | 关键 HTTP mutate 契约测 | 工程 | cancel/retry/run-now/create-rule 契约测试 | 低 | 中 |
| **8** | **A2** | 统一 read projection 残留 | 后端 | 剩余 GET/WS 路径补齐 ages/terminalReason/path-lock | 低 | 中 |

## 每个切片的 Must/Out（可直接开刀）

### F1 · 评论粘贴图/附件
**Must**
- CommentComposer 支持粘贴图片 → markdown embed data URL（本地，无云）
- 512KiB 校验 + MIME 过滤；UI 错误提示
- 单元 + paste 模拟测试

**Out**
- 全量 TipTap（以后再做）

### A9 · Grok ACP / 能力诚实
**Must**
- supportsSessionResume = true + `--resume` 注入
- UI 隐藏未实现 runtime（Pi/Grok）
- 纯函数 + 能力矩阵测试

**Out**
- Grok full ACP（可选）

### A4 · 灾备含项目级 Wiki
**Must**
- snapshot 打包 `wiki/projects/<id>/…`；manifest 含 coverage report
- 项目本地 wiki 根解析 + 覆盖报告

**Out**
- live restore 全量 swap（A4 之后再开）

### F2 · Issue Sheet 故事线摘要 + 失败主 CTA
**Must**
- Sheet 增加 storyline summary + 失败主 CTA
- Sheet 变体中保留板上下文

**Out**
- 全页属性（可选）

### F5 · HelperRail 对齐 Chat 关键路径
**Must**
- fail CTA / thread/stream 统一
- Helper 关键路径 CTA 与 Chat 对齐

**Out**
- 全量功能（可选）

### B2 · live restore 闸门
**Must**
- stage 已安全；live swap 需 quiesce + rollback journal + 人工确认

**Out**
- 立刻 live swap（A4 之后再开）

### B3 · 关键 HTTP mutate 契约测
**Must**
- cancel/retry/run-now/create-rule 契约测试

**Out**
- 所有路由（可选）

### A2 · 统一 read projection 残留
**Must**
- 剩余 GET/WS 路径补齐 ages/terminalReason/path-lock

**Out**
- 全量 GET（可选）

## 工程模式
- Slice Owner（子代理实现 + Playwright 关刀 + main 直推）
- 每刀：Must/Out 写清 → unit + Playwright → closeout 写 progress
- 优先：F1 > A9 > A4 > F2 > F5 > B2 > B3 > A2

## 推荐启动顺序
1. F1 （高痛感，低复杂度）
2. A9 （产品价值高）
3. A4 （运维闭环）
4. F2 （看板手感）
5. F5 / B2 / B3 / A2

需要我直接起 **F1** 或 **A9** 的 Slice Owner 吗？或者你指定一个切片，我立刻开 intake。