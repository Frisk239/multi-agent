# ui-link-memory-polish · impl-1

日期：2026-07-19

## 范围

1. **链接下划线**：对齐 Multica「实体链接默认无下划线、hover 变色」；表格/列表/运营链路去掉蓝线。  
   仅保留 markdown / empty-state / page-desc / settings hint 类正文链的轻下划线。
2. **Memory 列表可读性**：内容 4 行 clamp +「展开/收起」；列宽收紧；kind chip 更克制。

## 改动

| 文件 | 说明 |
|---|---|
| `globals.css` | 全局 `a` 无下划线；`.table-link` / `.data-table a`；清 hover underline；memory clamp/expand |
| `MemoryPage.tsx` | `expanded` state + 展开按钮 |
| `RunsPage.tsx` / `SquadsPage.tsx` | 实体链 `table-link` |

## 验收

- `/memory`：`textDecorationLine=none`；expandBtns>0；clamp=4；展开后 `.memory-text--expanded`
- `/runs` agent 链、`/squads` leader 链：无下划线
- web typecheck 通过

## 非目标

- 不做 Memory 独立详情/编辑路由（行内展开即可）
- curated PATCH 编辑留给后续可选刀

## 下一刀建议

- Agents 列表 collection header + readiness 密度
- Automation 模板画廊（G15）
- 看板/Issue 卡片链路线条统一（若仍有遗漏）
