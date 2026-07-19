# agents-collection-polish · impl-1

日期：2026-07-19  
对标：Multica Agents `CollectionPageHeader` + 列表就绪密度

## 范围

- Collection header：icon + title + count + 一行 ready/busy/阻塞摘要
- 就绪 chips：全部 / ready / busy / 阻塞（写 URL `?ready=`）
- 行操作补 **私信**（`/chat?agent=` 预选）
- page-body + surface-card 新建表单；runtime 链 `table-link` 无下划线

## 验收

- `/agents`：page-body、ready-summary、agent-list-chat
- chip → `?ready=ready`
- typecheck 通过

## 下一刀

- Automation 模板画廊 G15 或 Wiki collection header
