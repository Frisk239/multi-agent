# Triage Labels

本仓 tracker 为 **本地 markdown**（`.scratch/`），标签角色写在 issue 文件的 `Status:` 行。

| 角色（skills 用语） | 本仓 Status / 标签字符串 | 含义 |
|---|---|---|
| `needs-triage` | `needs-triage` | 维护者尚未评估 |
| `needs-info` | `needs-info` | 等补充信息 |
| `ready-for-agent` | `ready-for-agent` | 可 AFK `/implement` |
| `ready-for-human` | `ready-for-human` | 需人做 |
| `wontfix` | `wontfix` | 不做 |

`/to-tickets` 产出默认 `ready-for-agent`，**不要**再跑一遍 `/triage`。
