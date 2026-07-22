# UX Day-0 E1–E4（合并关刀）

Date: 2026-07-22  
Branch: main

## 范围

| 刀 | 交付 |
|---|---|
| **E1** | `OnboardingCard`：CLI → Project path → 新建 Issue；localStorage 完成 / session 跳过 |
| **E3** | `GET /api/wiki/meta`；Wiki/Memory 页眉非 per-project 诚实 |
| **E4** | list/cleanup `~/.multi-agent` 隔离 workdir；Settings 卡 |
| **E2** | `test-day0-e1-e4.mts` + 复跑 C1/C2/D2 脚本 |

## 验收

| 项 | 结果 |
|---|---|
| typecheck | PASS |
| test-day0-e1-e4 | ALL PASS |
| C1 / C2 / D2 scripts | ALL PASS |

## 手测清单（Playwright 可选）

1. 清 `localStorage.ma.onboarding.v1` → 首页见 3 步卡  
2. `/wiki` 见 root banner  
3. `/settings` 工作区区见隔离目录列表与「清理 >7 天」  

## Out

真 session resume、Wiki 物理分根、删 project_local。
