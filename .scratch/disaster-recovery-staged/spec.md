# Isolated staged restore v1

Status: done

## User path

Operator chooses a valid `.ma-backup.zip` in Settings and prepares an isolated, expiring restore package. The server extracts the archive under the backup directory, opens the staged SQLite read-only, runs `PRAGMA integrity_check`, verifies the schema marker, and reports the Wiki count. The operator can explicitly clean the stage. Live DB/Wiki, workers, runs, and automation state are untouched.

## Must

1. Accept only a validated snapshot name/path already constrained to the configured backup directory.
2. Extract into a random stage id under `.ma-restore-staging/<uuid>`, using a temporary directory and atomic rename.
3. Reject traversal or malformed entries before extraction; never follow archive paths outside the stage root.
4. Verify staged SQLite read-only with `PRAGMA integrity_check` and compare `user_version` to the manifest schema marker.
5. Return a structured stage report with expiry, DB integrity/schema/bytes, Wiki count/path, and `mutatesLiveState=false`.
6. Clean stages explicitly by UUID and automatically remove only expired stages with a valid expiry marker.
7. Settings must show “准备隔离包”, integrity, expiry, stage id, and “清理隔离包”; no live restore button yet.

## Out

- No live DB/Wiki swap, worker quiesce, rollback, or maintenance gate.
- No project-scoped Wiki restore mapping.
- No cloud upload or credentials.

## Research basis

- Multica `references/repos/multica/server/pkg/db/queries/agent.sql:558-648,739-785`: CAS/lease/recovery state transitions; active rows must not be blindly revived.
- Hermes `references/repos/hermes-agent/hermes_cli/backup.py:471-653,750-875`: validate before import, path traversal checks, runtime exclusions, and explicit import reporting.
- Hermes `references/repos/hermes-agent/tools/checkpoint_manager.py:794-849,873-1005`: pre-rollback snapshot and reversible journal/CAS principle.
- OpenWiki `references/repos/openwiki/src/agent/utils.ts:136-250`: stable content hashes and no-op-safe staged metadata.
