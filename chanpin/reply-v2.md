## V2 高保真原型交付 — Multica UI Replica

已按 `multica-image/` 18 张截图重做 `prototype/`，保留 seed + FRI-11 答辩路径。

### 交付物

| 文件 | 内容 |
|------|------|
| `prototype/index.html` | 完整 Multica 壳：侧栏 IA + Tab 栏 + briefing 面板 + 模态 |
| `prototype/assets/css/tokens.css` | `#0a0a0a` 暗色 token |
| `prototype/assets/css/app.css` | 全页 V2 样式 |
| `prototype/assets/js/app.js` | 路由 / Tab / 快捷键 / 模态 |
| `prototype/assets/js/views.js` | 12 页视图渲染器 |
| `prototype/data/seed.json` | 5 列状态、3 小队、machines/runtimes、skill 元数据 |
| `docs/design/multi-agent-platform-ia.md` | V2 IA 更新 |
| `prototype/test_must_paths.py` | V1 + V2 Must 路径 |

### V2 页面覆盖

| 页面 | 对齐截图 | 要点 |
|------|----------|------|
| 收件箱 | ref3–5 | 三栏：列表 + Issue 详情 + 时间线 |
| 我的 issue / Issues | ref7 | **5 列看板** + 筛选 Tab + 0 working |
| 新建 Issue | ref8/12/13 | 智能体/手动双模态 + 切换 |
| 小队 | ref9–11 | 列表 + 详情（成员/指令 Tab） |
| 智能体 | ref15–18 | 表格 + 详情 **8 Tab** |
| Skills | ref1 | 名称/被谁使用/添加者/更新时间 |
| 设置 | ref2 | 二级导航 + 个人资料表单 |
| 运行时 | img_00 | 机器列表 + Runtime 表格 |
| Wiki | — | 嵌入工作区侧栏 IA（非独立导航） |
| 命令面板 | ref6 | Ctrl+K |

### 硬约束核对

- ✅ 完整侧栏 IA（搜索+新建、收件箱/我的 issue、工作区 7 项含 Wiki、配置 3 项）
- ✅ FRI-11 在「审核中」列，指派「产品小队」，briefing + @mention 可点通
- ✅ Won't 未实装（无 CLI/DB/WS/GitHub API）
- ✅ `python test_must_paths.py` → **ALL MUST PATH TESTS PASSED**

### 打开方式

```text
cd D:\code\multi-agent\chanpin\prototype
python -m http.server 8765
# → http://127.0.0.1:8765/
```

请队长按 V2 MoSCoW + pm-critic 签核。
