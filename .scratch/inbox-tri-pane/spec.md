# inbox-tri-pane

## 用户路径
运维打开 Inbox → 左侧列表点一条通知 → 右侧（或中栏）阅读 title/body/meta → 在详情内标已读/归档/跳转 Issue·运行，**不必先离开 Inbox**。

## Must
- 列表+详情双栏布局（对齐 Multica 三栏中的左+中；Helper 另刀）
- URL `?item=<id>` 可分享选中项
- 选中时自动 markRead（已有行为保留）
- 详情展示 body 全文 + 操作按钮
- Playwright：选中后详情 testid 可见

## Out of scope
- Multica Helper 右栏（`helper-rail`）
- 真站归档折叠区完整复刻
