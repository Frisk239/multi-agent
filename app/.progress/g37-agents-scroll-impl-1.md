# Closeout: Agents 列表返回锚定

日期：2026-08-19  
Slug：`g37-agents-scroll`

## 用户路径

`/agents` 点进详情 → 后退 → `data-restored=1` 锚定刚打开的智能体。

## 交付

抽出 `useListAnchor`，与 Runs 共用 sessionStorage 协议。

## 证据

- web typecheck
- Playwright `e2e-g37-agents-scroll.mts` PASS
