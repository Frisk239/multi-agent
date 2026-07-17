# Spec: 最小自动化（补5）

**Status:** ready-for-agent（实现已在分支 `feat/bu05-automation` 完成，待 PR 合 main）

**Canonical design (historical):** [docs/superpowers/specs/2026-07-17-bu05-autopilot-design.md](../../docs/superpowers/specs/2026-07-17-bu05-autopilot-design.md)

**Plan (historical):** [docs/superpowers/plans/2026-07-17-bu05-automation.md](../../docs/superpowers/plans/2026-07-17-bu05-automation.md)

New work should prefer this folder + `/implement` tickets; do not reinvent under superpowers.

## Problem Statement

用户需要定时或一键按模板创建 Issue 并指派，而不手填看板。

## Solution

Automation rules（interval / daily_at）+ run-now；create_issue + 现网 enqueue；`/automation` UI。

## Out of Scope

Webhook、crontab 表达式库、run_only。
