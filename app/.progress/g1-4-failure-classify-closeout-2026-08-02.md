# G1-4 失败分类精度 closeout（2026-08-02）

> Goal G1 执行层诚实性 · Goal 第二波 M2 首刀。状态：**已关 ✅**

## 目标

provider_network 与 auth/quota 边界可区分，驱动更准的自动改派决策与用户文案（roadmap 引用 B5）。

## 勘察结论

`shared/src/failure-classify.ts` 的 `classifyFailure` 已存在（文本正则表 + `AUTO_RETRY_FAILURE_REASONS` 白名单 [timeout/stale_heartbeat/runtime_offline/provider_network]，auth/quota 不进自动重试），**缺口 = 分类正则仅英文**（backend 错误多为 CLI stderr 直传或中文文本，中文错误全落 exec_error → 错失重试或误进重试）；**UI failure-action-map 缺 provider_network/runtime_offline/deferred_escalated 三条键**（落 exec_error 文案）。

## 改动

| 文件 | 改动 |
|---|---|
| `shared/failure-classify.ts` | auth_required 补中文（未授权/未认证/未登录/登录已过期/认证失败/凭据无效）+ 凭据形态（invalid credentials / token expired / api key 无效·未配置）；quota_exceeded 补中文（额度/配额/限流/频率限制/余额不足/超限）；provider_network 补中文（网络/连接被重置/连接超时/请求失败/服务不可达）+ ETIMEDOUT/ECONNREFUSED/ENOTFOUND/connect timeout；规则 11 补「超时」。**刻意不含裸 login/api_key 与裸「超时」**：防 grok 兜底建议文案（「请确认已 grok login 或设置 XAI_API_KEY」）误判 auth；中文「执行超时」仍归 timeout |
| `web/failure-action-map.ts` | 补 3 键：provider_network「网络/服务中断」retry · runtime_offline「运行时离线」human · deferred_escalated「延迟升级」neutral |
| 测试 | shared +16 用例 + 3 排序守卫（中文超时→timeout / grok 提示不误判 auth / auth 优先于 network）；web map 3 新键 + 中文推断用例 |

改派决策侧零改动但分类更准：`AUTO_RETRY` 白名单与 `insertEscalatedChild` 谓词读 failureReason，中文错误不再误落 exec_error。

## 门禁

- shared 121 / server 730 / web 425（monorepo 全量 1276）；typecheck 全仓绿

## 未做（后续刀）

- grok 兜底文案本身仍把 ACP 提示追加到任意失败（含网络失败）——文案误导性问题属 G1-2 范畴，分类侧已确保不误判
- `spawn-line` 的 `exit <code>`（无 stderr）仍落 exec_error：无文本可分类，保持诚实
