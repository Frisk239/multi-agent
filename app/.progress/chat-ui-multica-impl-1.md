# chat-ui-multica · impl-1

日期：2026-07-21

## 问题

本仓 `/chat` UI 像简陋工具页：大页头、宽「USER」标签气泡、全宽发送按钮，与 Multica 真站聊天落差大。

## 对照真站

- 左栏：**聊天** 标题 + `+` 新建；会话行 = 头像缩写 + 标题 + 预览一行  
- 右栏：标题/agent 副标题；消息区；底部圆角输入条 + 圆形发送  
- 用户气泡靠右胶囊；助手 Markdown 靠左，无 USER/ASSISTANT 大写标签  

## 改动

- `ChatPage.tsx` 重写布局与交互（Enter 发送 / Shift+Enter 换行）  
- `globals.css` Multica 风格 chat 样式 + `main-content:has(.chat-page--multica)` 满高  

## 未做

- 流式打字 / 消息状态  
- 会话删除/重命名  
- Helper 与 Chat 会话列表统一  
