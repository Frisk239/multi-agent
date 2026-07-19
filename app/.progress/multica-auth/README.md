# Multica 真站登录态（本地 Agent 用）

## 文件
- `storage-state.json` — Playwright `storageState`（含 `multica_auth` cookie）
- **勿提交 git**（密钥级会话）

## 复用方式

```bash
# 可见浏览器 + 持久 profile（推荐人机协作登录）
playwright-cli open "https://multica.ai/frisk239-s-coding-workspace/issues" --headed --persistent

# 登录成功后固化
playwright-cli state-save "app/.progress/multica-auth/storage-state.json"

# 之后新会话可：
playwright-cli open "https://multica.ai/..." --headed --persistent
# 或 state-load（视 playwright-cli 版本支持）
playwright-cli state-load "app/.progress/multica-auth/storage-state.json"
```

## 失效时
跳转 `/login` 或 Google 页 → 请人重新登录 → 再 `state-save`。

## 迭代约定
对照真站时优先用 **headed**，便于人协助登录/点确认；对照本仓用 `localhost:3000`。
