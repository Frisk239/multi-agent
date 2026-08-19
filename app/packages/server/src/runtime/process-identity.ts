import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * A stable, non-secret identity for one OS process instance.
 *
 * `pid` alone is never safe across a server restart: operating systems can
 * reuse it. We deliberately keep only a hash of an OS-owned start marker so
 * the database never stores argv (which can contain a prompt or credentials).
 */
export type ProcessIdentity = {
  pid: number;
  platform: NodeJS.Platform;
  fingerprint: string;
  /** Whether this platform has a verified, owned root from which tree kill is safe. */
  canKillTree: boolean;
};

type ProcessIdentityDependencies = {
  platform?: NodeJS.Platform;
  readText?: (path: string) => string;
  run?: (command: string, args: string[]) => string;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function defaultReadText(path: string): string {
  return readFileSync(path, 'utf8');
}

function defaultRun(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: 'utf8',
    timeout: 1_000,
    windowsHide: true,
  });
}

function fingerprint(platform: NodeJS.Platform, marker: string): string {
  // Version the input: future additions must fail closed rather than matching
  // a legacy, weaker identity by accident.
  return sha256(`ma-run-owner/v1\u0000${platform}\u0000${marker}`);
}

/**
 * Capture a start-time fingerprint for a currently running process.
 *
 * Supported automatic-reconcile platforms:
 * - Linux: kernel boot id + /proc start ticks (monotonic and PID-reuse-safe).
 * - Windows: Win32_Process CreationDate from CIM (absolute process creation).
 *
 * Other platforms intentionally return null. That means recovery becomes
 * visible-but-no-kill, which is safer than treating a coarse `ps` timestamp as
 * proof that an unrelated PID is ours.
 */
export function captureProcessIdentity(
  pid: number,
  deps: ProcessIdentityDependencies = {},
): ProcessIdentity | null {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;

  const platform = deps.platform ?? process.platform;
  const readText = deps.readText ?? defaultReadText;
  const run = deps.run ?? defaultRun;

  try {
    if (platform === 'linux') {
      const stat = readText(`/proc/${pid}/stat`);
      // Field 2 (`comm`) can contain spaces and parentheses. The final `)` is
      // the only dependable separator before field 3 (`state`).
      const close = stat.lastIndexOf(')');
      if (close < 0) return null;
      const fields = stat.slice(close + 1).trim().split(/\s+/);
      // fields[0] is proc stat field 3; starttime is field 22 => index 19.
      const processGroupId = fields[2]; // proc stat field 5 (pgrp)
      const startTicks = fields[19];
      const bootId = readText('/proc/sys/kernel/random/boot_id').trim();
      if (!bootId || !/^\d+$/.test(startTicks ?? '') || !/^\d+$/.test(processGroupId ?? '')) return null;
      return {
        pid,
        platform,
        fingerprint: fingerprint(platform, `${bootId}:${startTicks}`),
        // All local POSIX CLI spawns deliberately use detached:true. Recheck
        // that contract before ever calling kill(-pid) after a restart.
        canKillTree: Number(processGroupId) === pid,
      };
    }

    if (platform === 'win32') {
      // PID has already been validated as an integer. Keep the script fixed so
      // it cannot interpolate arbitrary user-controlled shell syntax.
      const script = [
        `$p = Get-CimInstance -ClassName Win32_Process -Filter 'ProcessId = ${pid}'`,
        'if ($null -eq $p) { exit 3 }',
        '[string]$p.CreationDate',
      ].join('; ');
      const creationDate = run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        script,
      ]).trim();
      if (!creationDate) return null;
      return {
        pid,
        platform,
        fingerprint: fingerprint(platform, creationDate),
        // taskkill /T is best-effort, but only reaches this point after the
        // root Win32_Process identity itself was verified.
        canKillTree: true,
      };
    }
  } catch {
    // Process exited, CIM is unavailable, or access was denied. Every case is
    // deliberately indistinguishable to callers: do not auto-terminate.
  }

  return null;
}

/** True only when the same PID still has the exact persisted start identity. */
export function matchesProcessIdentity(
  pid: number,
  expectedFingerprint: string | null | undefined,
  deps: ProcessIdentityDependencies = {},
): boolean {
  if (!expectedFingerprint?.trim()) return false;
  const current = captureProcessIdentity(pid, deps);
  return current?.fingerprint === expectedFingerprint;
}
