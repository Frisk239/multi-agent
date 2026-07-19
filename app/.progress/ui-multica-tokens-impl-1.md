# Closeout: ui-multica-tokens

## 对照来源
- `references/repos/multica/packages/ui/styles/tokens.css`（surface 层级 / dark）
- `references/repos/multica/docs/design.md`（克制、灰度层次、字号纪律）
- `references/repos/multica/docs/ui-consistency-audit.md`（页面模式层）

## 交付
- 重映射 `:root`：app-shell / page-canvas / surface* / brand
- 别名兼容旧变量（`--bg-*` / `--text-*`）
- body/侧栏/主内容分层；按钮 primary/secondary/ghost 收紧
- 看板列/卡片更克制；页面标题字号收紧；细滚动条

## 未做（后续）
- 全量迁 shadcn/Tailwind（成本过高）
- Collection/Settings 页面模式组件层
- 亮色模式
