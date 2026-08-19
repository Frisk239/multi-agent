/**
 * G8-3 · Historical secret-literal safety boundary.
 *
 * New writes are guarded by runtime/agent-config and runtime/mcp-config. This
 * module is deliberately separate: it scans and explicitly cleans legacy DB
 * rows without ever returning, logging, or persisting a credential value.
 */
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { isSensitiveEnvKey } from './runtime/agent-config.js';
import { isSensitiveConfigKey, parseEnvReference } from './runtime/mcp-config.js';

export const SECRET_SAFETY_CONFIRMATION = 'CLEAN_LEGACY_SECRET_LITERALS' as const;

export type SecretSafetyStatus =
  | 'known_legacy_literals_detected'
  | 'no_known_legacy_literals'
  | 'scan_inconclusive';

export type SecretSafetyAdvisory = {
  status: SecretSafetyStatus;
  remediation: string;
};

/**
 * This is intentionally the complete public finding shape. In particular,
 * `value`, original JSON, and free-form parser errors must never be added.
 */
export type SecretSafetyFinding = {
  agentId: string;
  field: 'envVars' | 'mcpServers';
  path: string;
  key: string;
  length: number;
  fingerprint: string;
};

export type SecretSafetySummary = SecretSafetyAdvisory & {
  findings: SecretSafetyFinding[];
};

export type SecretSafetyCleanupResult = {
  summary: SecretSafetySummary;
  updatedAgents: number;
  after: SecretSafetyAdvisory;
};

type AgentConfigRow = {
  id: string;
  envVars: string | null;
  mcpServers: string | null;
};

type FieldInspection = {
  findings: SecretSafetyFinding[];
  malformed: boolean;
  changed: boolean;
  cleanedRaw: string | null;
};

type AgentInspection = {
  row: AgentConfigRow;
  env: FieldInspection;
  mcp: FieldInspection;
};

const REMEDIATION: Record<SecretSafetyStatus, string> = {
  known_legacy_literals_detected:
    '检测到历史敏感明文字面量。请先执行明确清理，再创建新的备份或快照；已有历史备份仍可能含明文。',
  no_known_legacy_literals:
    '未发现可识别的历史敏感明文字面量；这不是对未知字段或已有历史备份的绝对安全保证。',
  scan_inconclusive:
    '无法完整检查历史 Agent 配置。请先审查并执行清理，再创建新的备份或快照；已有历史备份仍可能含明文。',
};

function advisory(status: SecretSafetyStatus): SecretSafetyAdvisory {
  return { status, remediation: REMEDIATION[status] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function valueText(value: unknown): string {
  if (typeof value === 'string') return value;
  const serialized = JSON.stringify(value);
  return serialized ?? String(value);
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(valueText(value)).digest('hex').slice(0, 12);
}

function makeFinding(
  agentId: string,
  field: SecretSafetyFinding['field'],
  path: string,
  key: string,
  value: unknown,
): SecretSafetyFinding {
  const text = valueText(value);
  return {
    agentId,
    field,
    path,
    key,
    length: Buffer.byteLength(text, 'utf8'),
    fingerprint: fingerprint(value),
  };
}

function malformedFinding(
  agentId: string,
  field: SecretSafetyFinding['field'],
  raw: string,
): SecretSafetyFinding {
  return makeFinding(agentId, field, '$', '<malformed-json>', raw);
}

function emptyInspection(raw: string | null): FieldInspection {
  return { findings: [], malformed: false, changed: false, cleanedRaw: raw };
}

function inspectEnvVars(agentId: string, raw: string | null): FieldInspection {
  if (!raw?.trim()) return emptyInspection(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      findings: [malformedFinding(agentId, 'envVars', raw)],
      malformed: true,
      changed: true,
      cleanedRaw: null,
    };
  }
  if (!Array.isArray(parsed)) {
    return {
      findings: [malformedFinding(agentId, 'envVars', raw)],
      malformed: true,
      changed: true,
      cleanedRaw: null,
    };
  }

  const findings: SecretSafetyFinding[] = [];
  let changed = false;
  for (let index = 0; index < parsed.length; index += 1) {
    const row = parsed[index];
    if (!isRecord(row) || typeof row.key !== 'string' || !row.key.trim()) continue;
    const key = row.key.trim();
    // An envRef is safe metadata, but a persisted literal is not safe even if
    // an old row happens to contain both fields. Preserve only the reference.
    const hasPersistedLiteral =
      Object.prototype.hasOwnProperty.call(row, 'value')
      && row.value !== null
      && row.value !== '';
    if (isSensitiveEnvKey(key) && hasPersistedLiteral) {
      findings.push(makeFinding(agentId, 'envVars', `envVars[${index}].value`, key, row.value));
      row.value = '';
      changed = true;
    }
  }
  return { findings, malformed: false, changed, cleanedRaw: changed ? JSON.stringify(parsed) : raw };
}

function inspectMcpServers(agentId: string, raw: string | null): FieldInspection {
  if (!raw?.trim()) return emptyInspection(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      findings: [malformedFinding(agentId, 'mcpServers', raw)],
      malformed: true,
      changed: true,
      cleanedRaw: null,
    };
  }
  if (!isRecord(parsed)) {
    return {
      findings: [malformedFinding(agentId, 'mcpServers', raw)],
      malformed: true,
      changed: true,
      cleanedRaw: null,
    };
  }

  const hasWrapper = Object.prototype.hasOwnProperty.call(parsed, 'mcpServers');
  const servers = hasWrapper ? parsed.mcpServers : parsed;
  if (!isRecord(servers)) {
    return {
      findings: [malformedFinding(agentId, 'mcpServers', raw)],
      malformed: true,
      changed: true,
      cleanedRaw: null,
    };
  }

  const findings: SecretSafetyFinding[] = [];
  let changed = false;
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, `${path}[${index}]`));
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (isSensitiveConfigKey(key)) {
        // A ${env:NAME} string stores only a reference. Anything else under a
        // sensitive key is removed as one leaf, including nested legacy shapes.
        if (typeof child === 'string' && parseEnvReference(child)) continue;
        findings.push(makeFinding(agentId, 'mcpServers', childPath, key, child));
        delete value[key];
        changed = true;
        continue;
      }
      visit(child, childPath);
    }
  };
  visit(servers, 'mcpServers');
  return { findings, malformed: false, changed, cleanedRaw: changed ? JSON.stringify(parsed) : raw };
}

function inspectRow(row: AgentConfigRow): AgentInspection {
  return {
    row,
    env: inspectEnvVars(row.id, row.envVars),
    mcp: inspectMcpServers(row.id, row.mcpServers),
  };
}

function readAgentRows(database: Database.Database): AgentConfigRow[] | null {
  try {
    return database
      .prepare('SELECT id, env_vars AS envVars, mcp_servers AS mcpServers FROM agent ORDER BY id ASC')
      .all() as AgentConfigRow[];
  } catch {
    // A backup may be made from an early/foreign SQLite file that has no Agent
    // table. It is safer to say the scan was inconclusive than to claim clean.
    return null;
  }
}

function summarize(inspections: AgentInspection[], readFailed = false): SecretSafetySummary {
  if (readFailed) return { ...advisory('scan_inconclusive'), findings: [] };
  const findings = inspections.flatMap((item) => [...item.env.findings, ...item.mcp.findings]);
  const malformed = inspections.some((item) => item.env.malformed || item.mcp.malformed);
  const status: SecretSafetyStatus = malformed
    ? 'scan_inconclusive'
    : findings.length > 0
      ? 'known_legacy_literals_detected'
      : 'no_known_legacy_literals';
  return { ...advisory(status), findings };
}

/** Read-only scan. Its result is safe to render in UI and write to audit logs. */
export function scanSecretSafety(database: Database.Database): SecretSafetySummary {
  const rows = readAgentRows(database);
  if (!rows) return summarize([], true);
  return summarize(rows.map(inspectRow));
}

/**
 * Explicit, transactional cleanup for legacy rows only. It never guesses an
 * envRef. Valid env JSON retains its shape with sensitive literal values set
 * to '', while sensitive MCP leaves are deleted. Unparseable fields become
 * null because their contents cannot be proved safe.
 */
export function cleanLegacySecretLiterals(
  database: Database.Database,
): SecretSafetyCleanupResult {
  const rows = readAgentRows(database);
  if (!rows) {
    const summary = summarize([], true);
    return { summary, updatedAgents: 0, after: advisory('scan_inconclusive') };
  }

  const inspections = rows.map(inspectRow);
  const summary = summarize(inspections);
  const changed = inspections.filter((item) => item.env.changed || item.mcp.changed);
  if (changed.length > 0) {
    const update = database.prepare(
      'UPDATE agent SET env_vars = ?, mcp_servers = ? WHERE id = ?',
    );
    database.transaction(() => {
      for (const item of changed) {
        update.run(item.env.cleanedRaw, item.mcp.cleanedRaw, item.row.id);
      }
    })();
  }

  const after = scanSecretSafety(database);
  return {
    summary,
    updatedAgents: changed.length,
    after: advisory(after.status),
  };
}
