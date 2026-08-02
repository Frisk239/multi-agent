# G2-3 子代理成本汇总 closeout（2026-08-02）

> Goal G2 编排闭环 · Goal 第二波 M2 次刀。状态：**已关 ✅**

## 目标

学 hermes delegate_tool.py:2730——子 run USD 折入父节点，嵌套树自然汇总；RunDetail 子代理树可见成本。

## 勘察结论

- `estimateCost`（model-rates.ts:236-290，本地价表，无价表/未知 model → null + uncosted，禁止假 $0）与 `sumCostEstimates` 已存在；reshape 已给每个 run 注入 costUsd（自身成本）。
- **缺口 = `RunTreeNode` 只有 tokensInput/tokensOutput，无成本字段**；`subagent-tree.ts` buildNode 不折成本；SubagentTreeViewer 头部/节点只显示 tokens。
- 数据流：agent_run 4 个 token 整数列 → estimateCost 实时折算（不落库）。

## 设计（Slice Owner 拍板）

| 决策 | 选择 | 理由 |
|---|---|---|
| 折入语义 | 每节点 costUsd = 自身 estimateCost + Σ 直接子节点 costUsd（子节点已含其子树） | hermes delegate_tool.py:2730-2737 原注释：每次只折直接子层，嵌套树靠逐层折叠自然汇总 |
| uncosted 语义 | 自身 uncosted（有 token 但无价表/未知 model）或任一子节点 uncosted → 标记；**no_tokens 不标记** | 没跑过的 run（queued 等）不污染「部分未计价」；父未计费但子有 → 显示子成本之和 + 部分未计价（对应 hermes cost_source 升级为 subagent 的精神） |
| 展示 | SubagentTreeViewer 头部加总成本 + 「部分未计价」；树/流程两种视图节点均显示成本（与 RunDetailPage cost chip 同款 $ 格式） | RunDetail 内的树即折入展示面；列表/DB 保持自身成本（树查询成本高，不做全量折入） |

## 改动

| 文件 | 改动 |
|---|---|
| `shared/schema.ts` | `RunTreeNode` 类型 + zod 加 `costUsd?: number\|null`、`uncosted?: boolean` |
| `server/orchestration/subagent-tree.ts` | buildNode 后序折叠：own estimateCost（model/tokens）→ 节点 costUsd/uncosted |
| `web/components/SubagentTreeViewer.tsx` | formatUsd + 头部 `$total`（data-testid=subagent-tree-cost）+ 部分未计价 + 节点成本 |
| 测试 | subagenttree.test.ts +4：嵌套折叠汇总（父=自身+c1(含孙)+c2）/ 部分 uncosted / 无 token 不标记 / direct-children 只含自身 |

## 真机验收（dev.db 注入父子孙 demo run + MA_MODEL_RATES_JSON 价表 + Playwright）

价表 opencode/big-pickle=1/3、grok-4.5=2/10（USD/1M）；父(1000/2000) c1(3000/1500) c2(500/800) 孙(200/100)：
- API `GET /api/runs/:id/tree`：父 `costUsd: 0.0249`（= 0.007 + 0.0089 + 0.009，与手算一致）、c1 0.0089（含孙 0.0014）、c2 0.009、uncosted=false ✅
- UI：头部 `| $0.0249`；节点「成本: $0.008900 / $0.001400 / $0.009000」✅
- 证据：`.playwright-cli/m1-g23-cost-rollup.png`（demo run 已清理）

## 门禁

- server 730 / shared 121 / web 425（monorepo 1276）；typecheck 全仓绿

## 未做（后续刀）

- RunsPage/DB 列表不做全树折入（每 run 一次树查询成本高；树只在详情入口展示）
- 无价表时的「配置引导」入口（Settings 无 model-rates 提示；uncosted 文案已说明原因）
