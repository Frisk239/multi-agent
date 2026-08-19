# 执行者 Kickoff · G8-6 长轨迹 UX + Subagent 错误 + 文案

---

## 启动提示词（复制从下一行开始）

```
你是本仓实现执行者。工作区：multi-agent 仓库根。前端为主。

## 铁律
- 不做 TipTap；不做 Wiki 图谱。
- 复用 ErrorState / 既有虚拟化 / afterSeq 分页，不重造协议。

## 本刀：G8-6 · 长轨迹锚定 + Subagent 树错误 + 极小文案
规格：`.scratch/g8-trust-execution/spec.md` §G8-6

### Must
1. **RunDetail 长轨迹**
   - 打开/有新消息时默认锚定最新（已有 stick 则修边界与文案）。
   - 「加载更多」语义改为「加载更早的事件」类文案（若当前是 500 条窗口，说清楚方向）。
   - 可选：WS 重连后若可能不完整，一条轻量提示（无则 skip）。
2. **SubagentTreeViewer**
   - `isError || !tree` 勿 `return null`；展示 ErrorState 或「加载失败 · 重试」。
3. **文案**
   - `IssueSideSheet` 若仍有「Rich Text 附件」→ 改为「Markdown · 附件」（或等价诚实文案）。
4. 相关组件测；不破坏 transcript 虚拟化（≥100）。

### Out
- Multica 级 diff 高亮 transcript dialog
- 后端消息协议改版（G6-5 已有 afterSeq）

### 建议触摸
- `RunDetailPage.tsx`
- `SubagentTreeViewer.tsx`
- `IssueSideSheet.tsx`
- 既有 test

### 验收自测
- [ ] 树 API 失败可见
- [ ] load-more 文案正确
- [ ] Sheet 徽章诚实
- [ ] web tests 相关绿

### 回报
文件列表、自测、截图可选。
```

---

## 计划者验收清单（G8-6）

- [ ] Subagent 错误可见  
- [ ] 长轨迹文案/锚定合理  
- [ ] Rich Text 文案已改  
