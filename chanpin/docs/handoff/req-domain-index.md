# Handoff: REQ 域快速索引 — 原型实现对照

> 队员 3 实现时按域拆分任务；完整 AC 见 [`intent-mvp-prototype.md`](./intent-mvp-prototype.md)

## Must REQ 清单（32 条）

### ISS（10 Must）

| ID | 一句话 | 实现提示 |
|----|--------|----------|
| ISS-001 | 三列看板 | CSS grid 3–4 col |
| ISS-002 | 拖拽换状态 | HTML5 DnD 或 click-to-move |
| ISS-003 | 卡片 identifier+assignee | badge 组件 |
| ISS-004 | 点击开详情 | 主区路由或 panel |
| ISS-005 | comment 时间线 | 垂直 timeline 组件 |
| ISS-006 | assignee agent/squad | `<select>` 切换 |
| ISS-007 | @mention pill | regex 解析 → span.mention-pill |
| ISS-008 | seed 6–10 Issue | data/seed.json |
| ISS-009 | FRI-11 格式 | identifier 字段 |
| ISS-010 | Won't | 不实现 |

### SQD（6 Must）

| ID | 一句话 | 实现提示 |
|----|--------|----------|
| SQD-001 | Squad roster | 列表 + leader badge |
| SQD-002 | 预置产品小队 | seed.squads[0] |
| SQD-003 | briefing 右栏 | 三段 collapsible |
| SQD-004 | roster mention 链接 | markdown-lite 渲染 |
| SQD-005 | @mention 委派态 | pill + optional label |
| SQD-006 | 3min demo path | 见 demo-script |
| SQD-007 | Won't | 不实现 |

### AGT（4 Must + 1 Should）

| ID | 一句话 | 实现提示 |
|----|--------|----------|
| AGT-001 | Agent 列表 | table/card list |
| AGT-002 | 创建/编辑 | modal 2-step wizard |
| AGT-003 | runtime 下拉 4 项 | Pi/Claude/opencode/Cursor |
| AGT-004 | MCP 入口 | empty list + Add button |
| AGT-005 | 状态 badge | Should — static idle/working |

### SKL（3 Must）

| ID | 一句话 | 实现提示 |
|----|--------|----------|
| SKL-001 | URL 导入 | input + push to array |
| SKL-002 | Skill 列表 | name + url column |
| SKL-003 | Agent 分配 | checkbox group on agent form |

### NAV（4 Must）

| ID | 一句话 | 实现提示 |
|----|--------|----------|
| NAV-001 | 三栏布局 | flex: 240px | 1fr | 320px |
| NAV-002 | 左栏四项导航 | router or show/hide |
| NAV-003 | 右栏上下文 | bind to selection state |
| NAV-004 | 暗色主题 | CSS vars --bg #1a1a2e 类 |

### WIK（4 Must）

| ID | 一句话 | 实现提示 |
|----|--------|----------|
| WIK-001 | Wiki 树 | nested ul / tree component |
| WIK-002 | 点击渲染页 | innerHTML or markdown render |
| WIK-003 | 5 页 seed | home/architecture/synthesis/sprint-log/glossary |
| WIK-004 | llm-wiki-pattern 对齐 | 路径与 PRD Q2 一致 |

---

## Seed 数据最小示例

```json
{
  "squads": [{
    "id": "sqd-product",
    "name": "产品小队",
    "leaderId": "agt-lead",
    "memberIds": ["agt-research", "agt-prd", "agt-proto"]
  }],
  "issues": [{
    "id": "iss-11",
    "identifier": "FRI-11",
    "title": "毕设 multi-agent：产出 PRD 与原型",
    "status": "running",
    "assignee": { "type": "squad", "id": "sqd-product" },
    "comments": [
      { "authorType": "human", "body": "请基于调研写 PRD。" },
      { "authorType": "agent", "authorId": "agt-lead", "body": "Operating Protocol...\n[@产品·调研官](mention://agent/agt-research) 请先完成 research。" }
    ]
  }]
}
```

---

## 视觉 Token 建议（对齐 Multica 暗色）

| Token | 值 | 用途 |
|-------|-----|------|
| `--bg-primary` | `#0f0f14` | 主背景 |
| `--bg-secondary` | `#1a1a24` | 卡片/面板 |
| `--border` | `#2a2a3a` | 分隔线 |
| `--text-primary` | `#e8e8f0` | 正文 |
| `--text-muted` | `#8888a0` | 次要文字 |
| `--accent` | `#6366f1` | 链接/选中 |
| `--status-backlog` | `#64748b` | 列头 |
| `--status-running` | `#3b82f6` | 列头 |
| `--status-done` | `#22c55e` | 列头 |

---

## 文件交付检查

- [ ] `prototype/index.html` 可双击或 static serve 打开
- [ ] `prototype/data/seed.json` 含完整 seed
- [ ] 暗色三栏默认可见
- [ ] demo script 5 步可完成
- [ ] 控制台无 error
- [ ] Won't 功能未实现
