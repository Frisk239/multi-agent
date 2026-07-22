# UX Day-0 / Polish — P1 Implementation Plan

> Slice Owner · main 直推 · 每刀 typecheck + 脚本/手测 + `app/.progress/*-impl-1.md`  
> **Phase：** `app/.progress/phase-ux-day0-2026-07-22.md`  
> **来源：** UX Trust A–D 收官后对照 Multica — 无 P0 硬洞，补 **冷启动 / 证据 / 知识诚实 / 磁盘卫生**

**Goal:** 新用户 3 分钟内能派第一条活；主路径有回归证据；Wiki/Memory 不装 per-project；隔离目录可清理。

**默认顺序：**

```
E1 首启 3 步 → E3 Wiki/Memory 诚实根 → E4 隔离目录清理 → E2 主路径脚本证据
```

（E2 可与 E3/E4 并行；E1 优先。）

---

## Backlog

| ID | 优先级 | 切片 | Demo |
|---|---|---|---|
| **E1** | P1 | 首启 3 步向导 | 未完成 onboarding 时主区卡片：CLI → 建 Project 绑 path → 去建 Issue |
| **E3** | P1 | Wiki/Memory 根路径诚实 | 页眉显示 wiki 目录绝对路径 + 「非按项目分根」 |
| **E4** | P1 | 隔离 workdir 清理 | Settings：列出/清理 `run-workspaces` 与 `chat-sessions`（禁删 project_local） |
| **E2** | P1 | 主路径证据包 | 一键脚本串 C1/C2/cwd + 文档清单；可选 Playwright 烟测笔记 |

**Out：** session resume、看板列表视图、通知偏好、Wiki 物理分根、daemon。

---

## E1 — 首启 3 步

**设计：**

| 项 | 选择 |
|---|---|
| 展示条件 | `localStorage ma.onboarding.v1 !== 'done'` 且非 Settings 全屏噪音；有任意 project 且有 online runtime 可自动标完成 |
| Step1 | Settings checks 中 `runtime:*` 非全 error → 链 `/runtimes` |
| Step2 | 有 ≥1 project 且 `localPathExists` → 完成；否则链 `/projects` + 文案绑 path |
| Step3 | 链 `/?new=1` 或「我的 issue」新建 |
| 完成 | 按钮「完成引导」写 localStorage；「稍后再说」dismiss 本会话 |

**Files：** `OnboardingCard.tsx` · `layout`/`page` 挂载 · `globals.css` · progress

---

## E3 — Wiki/Memory 诚实

**设计：** `GET /api/wiki/meta` → `{ rootPath, source: workspace|cwd, perProject: false }`；WikiPage + MemoryPage 顶栏一行。

---

## E4 — 隔离目录清理

**设计：**  
- `GET /api/settings/isolated-workspaces` 列表（issue/run/chat 目录，size 可选粗算）  
- `POST /api/settings/isolated-workspaces/cleanup` body `{ ids: string[] }` 或 `{ olderThanDays }`  
- **禁止** 删 `project_local` 路径  
- Settings 运维卡 + confirm

---

## E2 — 证据

`app/packages/server/scripts/test-day0-smoke.mts` 串跑已有 c1/c2/cwd 相关 assert；progress 记 Playwright 手测清单。

---

## DoD

- [x] 冷机用户看到向导且可完成/跳过（E1 OnboardingCard）  
- [x] Wiki 页可见根路径与非 per-project 说明（E3）  
- [x] Settings 可清理隔离目录（E4）  
- [x] smoke 脚本 PASS + typecheck（E2）
