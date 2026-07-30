# Disaster recovery research (2026-07-30)

Status: ready-for-agent

## Current gap

- `app/packages/server/src/ops-backup.ts:5,149-220,232-289` only creates/lists SQLite `.db` backups through better-sqlite3 `.backup()`; the file explicitly excludes Wiki packaging and restore UI.
- `app/packages/server/src/routes/ops.ts:25-65` exposes snapshot, create backup, and list backups only. There is no validate, restore, dry-run, download, or retention endpoint.
- Settings shows operational health/snapshot but has no backup hook or visible backup list (`app/packages/web/components/SettingsPage.tsx:1239-1286,1401-1515`).
- Wiki is filesystem state (`app/packages/server/src/wiki/store.ts:67-294`) with pages/index/log/raw/sidecar writes, but no versioned manifest, whole-tree hash, atomic archive, export/import, or repair API (`app/packages/server/src/routes/wiki.ts:57-166`).

## Hard risk

The current DB backup boundary excludes Wiki. A machine move or bad-database restore can leave SQLite records and `wiki/` files out of sync; there is also no user-visible validation or recovery report.

## Reference evidence

- Hermes `references/repos/hermes-agent/hermes_cli/backup.py:256-286,471-653,750-875`: complete ZIP backup, WAL-safe SQLite snapshot, manifest, volatile/cache exclusions, marker/path-traversal validation, pre-overwrite confirmation, restore statistics and retention.
- OpenWiki `references/repos/openwiki/src/agent/utils.ts:138-240` and `openwiki/operations/credentials-and-updates.md:64-73`: stable SHA-256 directory snapshot, metadata written only when content changes to avoid scheduled no-op churn.
- Multica `references/repos/multica/server/internal/handler/task_lifecycle.go:16-55`: startup recovery reports orphan counts; recovery should be observable rather than silent.

## Options

1. DB restore only: smallest implementation, but leaves Wiki inconsistency unresolved.
2. Recommended: versioned `.ma-backup.zip` containing WAL-safe DB, Wiki tree, manifest with file hashes/schema/root metadata; create/list/validate/dry-run restore plus Settings UI first, staged restore and consistency report second.
3. Wiki manifest/export first: lower risk, but still cannot recover a broken DB.

## Proposed next vertical slice

`snapshot v1`: create a validated archive, list/download it, inspect manifest and hash results, and expose a Settings backup/recovery panel with retention/age/size. Restore remains dry-run + explicit confirmation until staged swap and rollback evidence are implemented.
