# Intake: UX P2 Polish

Date: 2026-07-22  
Prev: `ux-p2-polish-impl-1.md` · phase `phase-ux-p2-2026-07-22.md`  
Commit: `750c1a1` (`feat: issues list view, inbox prefs, chat partial, wiki dir env`)

## 合并状态

- `main` == `origin/main` @ `470028a`（docs deep-slices 计划在 P2 之上）
- 产品交付 commit `750c1a1` 已是 `main` 祖先
- 工作区另有未提交改动（`app/README.md`、`ux-gap-…`、scratch 等）— **不纳入本 intake 范围**

## 证据复核

| 检查 | 结果 |
|---|---|
| typecheck | PASS（shared/web/server） |
| `scripts/test-p2-polish.mts` | ALL PASS（inbox prefs + wiki dir source） |
| 代码抽检 A | `KanbanBoard.tsx`：`?view=list\|board` |
| 代码抽检 B | `inbox-prefs.ts` + Settings `settings-inbox-prefs` + API |
| 代码抽检 C | `ws.ts` `appendPartial` + progress 过滤 |
| 代码抽检 D | `MA_WIKI_DIR` + meta `source` 文案 |
| 安全 | 交付 commit 无 `wiki/` 运行产物 / `*.db` / 密钥 |

## Spec vs 声称

| ID | 判定 |
|---|---|
| A 列表视图 | 在 |
| B 通知偏好 | 在 + 脚本绿 |
| C Chat partial | 在 |
| D Wiki 根 env | 在 + 脚本绿 |
| E session resume | **刻意不做**（阶段表记债）— 符合关刀，不返工 |

## 债（不挡下一刀）

- P2-E / 真 CLI session resume → Deep Slice **DS1**
- 看板手动排序 → **DS2**
- Wiki per-project → **DS3**
- Token / thinking → **DS4**

## 裁决

**通过**

可开下一刀：**DS2 看板手动排序**（默认顺序 DS2 → DS4 → DS1 → DS3）。
