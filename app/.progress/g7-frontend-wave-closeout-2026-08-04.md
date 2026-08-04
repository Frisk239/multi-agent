# G7 前端体验第二波 · 关刀 closeout（2026-08-04）

> 覆盖 roadmap §3「G7 前端体验第二波」全部 12 刀（G7-1 … G7-12）。Playwright 验收 **17/17 PASS**（`scripts/e2e-g7-frontend-wave.mts`）+ 回归 **6/6 PASS**（`e2e-multica-full-verify.mts`）；全量用例 **1546 绿**（shared 121 + server 954 + web 471，web 新增 toast 5 用例）。

## 每刀落地

| 刀 | 改动 | 关键点 |
|---|---|---|
| G7-1 | `KanbanBoard.tsx:304-321` openIssueSheet 改 push | 打开 Sheet = `router.push`（Back 一次即关，学 Linear/Notion 侧滑）；已开面板换卡 = `replace`（防污染筛选历史）；关闭仍 URL 驱动（popstate → useSearchParams → Sheet 自动卸载，无需额外 handler） |
| G7-2 | `lib/api/issues.ts:38-49` useIssues `staleTime: 30_000` | 看板-详情往返不整板 refetch + skeleton 闪烁；invalidateQueries 仍强制 refetch，WS 实时性不受影响 |
| G7-3 | `lib/api/memory.ts:407-427` useMemoryList `refetchInterval: 15_000` | Memory 页活性诚实——完成 issue 的 ambient 记忆 15s 内可见；服务端无 memory WS 广播，轮询为最小诚实路径（roadmap 允许的两选项之一） |
| G7-4 | `RunDetailPage.tsx` transcript 虚拟化 | ≥100 条事件切 `@tanstack/react-virtual` 窗口化（复用 KanbanColumn Slice 37 模式：绝对定位 + measureElement 动态测量 + gap:4 + overscan:12）；展开态窗口感知——expanded 只保留窗口内 key，防长 run 无限膨胀；筛选/展开/首屏均不卡。e2e 注入 120 条消息 run 实测 `virtualized=1 rendered=22/120` |
| G7-5 | `IssueDetail.tsx` IssueSheetMeta | 优先级 Select（issue-sheet-priority）+ 标签行内编辑（IssueLabelsEditor）入 Sheet；「扫板-处理」不跳出看板（flex-basis:100% 独占一行） |
| G7-6 | `AssigneeSelect.tsx` 抽出受控 `AssigneeCombobox` + `NewIssueForm.tsx` 复用 | 搜索 + 过滤下拉 + readiness 提示/禁用（pi 未实现执行 / 硬闸）与详情页同源；新建表单可搜指派（new-issue-assignee-search）；onChange 业务副作用留在调用方 |
| G7-7 | `InboxPage.tsx` 键盘 effect 加 Enter | j/k 此前已存在；Enter = 打开选中项完整目标（issueId → 全页 / runId → /runs?run= / 兜底主 CTA），焦点在 BUTTON/A 时交还原生行为。e2e 实测 `?issue=…` → `/issues/<id>` |
| G7-8 | `lib/toast.tsx` 重写 | 堆叠上限 `MAX_TOASTS=4`（挤掉最旧，纯函数 `enqueueToast` 可单测）；hover 完全冻结倒计时（暂停存剩余毫秒，移出续倒）；action 链接与消息体分离 + 独立 × 关闭钮；+5 用例（cap/暂停/分离/到期） |
| G7-9 | `lib/use-page-title.ts` 新 hook | 6 页接线：IssueDetail（identifier · 标题）、RunDetailPage（运行 短id）、RunsPage、WikiPage（页 title）、MemoryPage、InboxPage、KanbanBoard；卸载还原基础标题 |
| G7-10 | `WikiPage.tsx` 分享链 Link → 复制按钮 | `navigator.clipboard.writeText(完整 URL)` + 「已复制」1.5s 反馈（与 Memory 页 copyText 模式一致） |
| G7-11 | `MemoryPage.tsx` 3 处 `colSpan={7}` → `{8}` | thead 实为 8 列（含全选），空/错/loading 行对齐 |
| G7-12 | `KanbanBoard.toolbar.tsx` 导入/导出收进筛选区 | 低频运维按钮移入「筛选」展开区尾部（kanban-toolbar-io + 分隔线），primary 行 0 个运维按钮；G5-7 功能本身未动 |

## 验收证据

- `scripts/e2e-g7-frontend-wave.mts`（新增，入库）：**17/17 PASS** —— G7-1 打开/Back 关闭/URL 清洁 · G7-2 返回无 skeleton · G7-5 优先级+标签 · G7-6 可搜指派 · G7-7 j 选中 + Enter 深链 · G7-9 /runs 与 /memory 标题 · G7-3 列表渲染无错误行 · G7-10 复制反馈 · G7-12 primary 无运维按钮 · G7-4 虚拟化（DB 注入 120 条消息 run，rendered 22/120 + viewport）
- `scripts/e2e-multica-full-verify.mts` 回归 **6/6 PASS**（/ /inbox /chat /projects /settings /live-probes）
- 全量 vitest：web 471（+5 toast）、server 954、shared 121 —— 全部绿

## 备注

- 侧栏高亮已修（北星提示勿重复开）——本波未触碰
- G7-7 现状复核：j/k/e/r 已存在（此前 Q7 或更早已落），本刀只补 Enter 打开
- G7-4 阈值 100 与 KanbanColumn 的 40 不一致是有意的：transcript 行高变化大（展开态），小列表朴素渲染体验更稳
- e2e 用独立库 `e2e-playwright.db`（migrate+seed），脚本内直插 inbox/run 消息数据，不污染 dev.db

## 下一步建议（roadmap §4 池）

- G6 剩余：G6-5 消息/列表端点游标分页 · G6-7 automation skipped 运营警示
- G7 已全关；无新开刀建议（§5 刻意不做保持不变）
