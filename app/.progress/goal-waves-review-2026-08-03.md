# Goal 四波迭代复盘（2026-08-02 → 08-03）

> 阶段：路线重写（2026-08-02）后的 goal 模式 + Slice Owner 四波迭代收官。
> 路线真源：[design/roadmap.md](../../design/roadmap.md)（G1–G5）。本复盘为阶段性总结，不替代 roadmap。

## 一、背景

2026-08-02 依据三份子代理分析（后端薄弱点 / 前端交互缺口 / 对照 references 上游 multica·hermes·pi）+ 8 份规划文档未做项清单，重写路线为 G1–G5 Goal 体系。此后由用户 `/goal` 定义目标（每波一份提示词），Slice Owner（子代理执行）逐刀关刀，共四波。

## 二、四波成果

| 波 | 主题 | 刀数 | 关键成果 |
|---|---|---|---|
| 1 | 深度可信（核心） | 6 | Pi 真机验收 + RPC 命令面（steer/compact/set_model）· Grok fail-closed · deferred-escalation 惰性升级 · 记忆 FTS5 检索 · 流式围栏 scrubber · 错误态三件套 |
| 2 | 诚实性收尾 + 闭环补全 | 8 | CLI 探测宽限窗测试固化 · Autopilot 离线语义（skipped）· Wiki 无 key 降级 · 失败分类中文边界 · 子代理成本汇总 · 看板键盘拖拽 · 读投影统一 · Memory 四级 scope |
| 3 | 产品完成态 | 10 | scanner/import-url 测试（51 例，**顺带修 2 生产 bug**）· auto-retry 类型安全 · 灾备 Wiki 换入 · 进程生命周期 · inline transcript 预览 · envVars 编辑 · 附件真实上传 · CLI 跨根检索 · 自定义字段回归网 |
| 4 | 运营闭环 + 最终打磨 | 6 | envVars 执行层注入（printenv 实证）· 系统/桌面通知 · 运营统计（cycle time/利用率/趋势）· Wiki backlink · 看板 JSON 导入导出 · CmdK 高亮 + 失败卡一键重试 |
| 收尾 | 浅项 | 2 | G2-5 全局并发配额 · G1-5 pgvector 降级可观测 |

**合计：32 刀关（G1–G5 池 33 项全清），剩 G1-2 A 分支（ACP stdio 客户端）唯一大工程。**

## 三、关键数字

- **测试**：1239 → 1394（+155 用例；shared 121 / server 831 / web 442 为收尾前基线）
- **迁移**：0048（deferred + fire_at）· 0049（agent env_vars/custom_args）· 0050（workspace 全局并发配额）
- **生产 bug 顺带修复**：2（github 多 skill fallback 死代码 `dirs` 构造后未传；clawhub meta 请求不在 try/catch 阻断导入）
- **真机验收**：每刀 Playwright/真机证据；四波累计 20+ 场景（含注入 500 错误态、键盘拖拽、printenv 环境变量、pi session 文件围栏、344 条导出 roundtrip）
- **里程碑**：main 持续可跑，全量门禁每刀绿

## 四、方法论沉淀（最重要产出）

1. **勘察先行（反复验证）**：roadmap 基线多次过期——宽限窗逻辑早已存在（bu02 readiness）、classifyFailure 已存在只缺中文、memory scope 列已存在只缺语义、Wiki health 报告已闭环、CmdK 拼音/scroll 恢复已存在。执行方学会「先 grep 现状再决定做多少」，五波内多次避免了重复实现。
2. **门禁必须全量含 shared 包**：第一波 G2-1 改 shared 枚举未同步测试，全量 `pnpm test` 在 shared 阶段挂红（Owner 验收发现修复）；此后每刀强制报 monorepo 全量数。
3. **push 及时性**：第三波曾因代理失效滞留本地（closeout 预警 + 复核确认）；收尾波在开工前先确认远端同步。
4. **测试暴露生产 bug**：G5-1 补测试时挖出 2 个真实 bug——「补测试」不是纯债，是高杠杆的投资。
5. **半截补全意识**：G3-4 落库未注入（「已存未用」是隐藏的声明不符）→ 第四波 M1 优先补执行层，printenv 实证闭环。教训：验收标准要覆盖「功能真实生效」，不止 UI 可见。
6. **真机验收不可替代**：G1-1 发现 pi Windows bash 长任务异常、G1-2 发现 grok `-p` 顶层形态 100% 失败（mock 测不出）、G2-1 用 cwd_missing 模拟离线——mock 全绿≠能跑。
7. **诚实性贯穿全程**：uncosted 不标 $0、cycle time samples=0 诚实显示、坏 JSON 降级 null 不砸 run、失败分类刻意防误判（裸 login/api_key 不进 auth）。
8. **零依赖哲学**：系统通知用 PowerShell WinForms 原生（拒 node-notifier native 二进制）；与「纯本地」宪法一致。
9. **数据分叉风险识别**：G1-5 明确不做运行时 provider 切换（pgvector/sqlite 两套物理存储，切换 = 丢记忆窗口），只做启动降级可观测——知道「不做」和知道「做」同样重要。

## 五、当前状态与下一步

- **main = 3678d06**（收尾波后），G1–G5 池仅剩 **G1-2 A 分支（ACP stdio 客户端）**：port multica grok.go，接 `grok agent stdio`（initialize/authenticate/session/prompt），恢复 `supportsSessionResume=true` + usage 落库；可复用 G1-1 的 `sendRunCommand` 接口。
- **建议**：
  1. ACP 大工程独立开 goal（工作量大，需 mock ACP server 测试网）
  2. 或进入「用产品养产品」阶段——四波后功能面已齐，真实使用暴露的痛点比规划文档更有价值
  3. roadmap §4 已全量回写；后续新刀按 §3 池或新痛点取用
