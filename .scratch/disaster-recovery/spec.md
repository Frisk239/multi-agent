# Snapshot v1 disaster recovery

Status: done

## User path

Operator opens Settings, creates a local snapshot that contains the SQLite state and the configured Wiki tree, sees its manifest/hash/size/age, validates an existing snapshot, and can run a non-destructive dry-run restore. No live database or Wiki files are overwritten in this slice.

## Must

1. Add a versioned `.ma-backup.zip` archive format with a manifest containing archive version, createdAt, DB schema/migration marker, workspace cwd metadata, file list, sizes, and SHA-256 hashes.
2. Snapshot SQLite with the existing WAL-safe better-sqlite3 backup path; include the resolved global Wiki tree (and explicitly report when project-scoped Wiki roots are not included) while excluding DB `-wal/-shm`, caches, runtime workspaces, and secrets.
3. Add list/create/validate/dry-run restore API contracts. Validation must reject path traversal, missing manifest, unknown version, hash mismatch, malformed archive, and zero-byte DB; dry-run must return a structured report without mutating live state.
4. Add Settings UI for create/list/validate/dry-run, showing age/size/hash status and actionable errors. No silent overwrite and no restore mutation yet.
5. Add tests for manifest determinism, hash mismatch, traversal rejection, DB/Wiki inclusion, dry-run non-mutation, and API/UI happy/error paths.

## Out

- No live restore/staged swap/rollback in this slice.
- No cloud upload, daemon, Redis, credentials, or secret files in archives.

## Research basis

- Hermes `references/repos/hermes-agent/hermes_cli/backup.py:256-286,471-653,750-875` for ZIP/manifest/WAL-safe backup, exclusions, traversal checks, and restore reports.
- OpenWiki `references/repos/openwiki/src/agent/utils.ts:138-240` for stable directory hashing and no-op-safe metadata.
- Current gap: `.scratch/disaster-recovery/research.md`; existing DB-only implementation is `app/packages/server/src/ops-backup.ts`.
