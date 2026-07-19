// 启动时加载本地 .env（密钥不进 git；见根目录 .gitignore 的 .env）
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function parseEnvFile(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** 从 server 包根加载 .env；已有 process.env 优先，不覆盖 */
export function loadLocalEnv(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/ -> packages/server/
  const candidates = [
    resolve(here, '../.env'),
    resolve(process.cwd(), '.env'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const map = parseEnvFile(readFileSync(path, 'utf-8'));
    let n = 0;
    for (const [k, v] of Object.entries(map)) {
      if (process.env[k] === undefined || process.env[k] === '') {
        process.env[k] = v;
        n += 1;
      }
    }
    if (n > 0) {
      console.log(`[env] loaded ${n} key(s) from ${path}`);
    } else {
      console.log(`[env] file present (no new keys): ${path}`);
    }
    return path;
  }
  return null;
}
