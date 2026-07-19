# Closeout: inbox-tri-pane

## Multica 对照（固化登录态）
- Playwright：`--headed --persistent` → `https://multica.ai/.../inbox` **loggedIn**
- 真站：列表 | 详情（「选择一条通知查看详情」）| Helper 右栏
- 本刀：实现 **左列表 + 右详情**（Helper 另刀 `helper-rail`）
- 鉴权固化：`app/.progress/multica-auth/storage-state.json`（gitignore）+ README

## 交付
- Inbox 双栏 `inbox-split`；点选 `?item=`；详情 title/body/操作
- 行内次要操作收敛到详情栏（列表更干净）
- CSS：`.inbox-split*` / `.inbox-detail*` / active 行

## 证据
- typecheck 绿
- Playwright local：
  - split/list/detail 存在
  - 点击行 → `?item=…` + title「Run 失败 · FRI-47」+ body + actions
- Multica：登录态打开 inbox 成功（hasHelper/hasArchive）

## 决策
- 不强制跳转：select 只读详情；「跳转目标」才导航
- 选中即 markRead（保留原行为）

## 下一刀
- `agent-chat` 或 `helper-rail`（live gap G9/G10）
