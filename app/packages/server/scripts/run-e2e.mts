/**
 * e2e runner —— 统一跑 scripts/e2e-*.mts 的入口（tsx 直跑，不需要 dev server 常驻前提）
 *
 * 用法：
 *   cd app/packages/server
 *   pnpm e2e                                          # 全部 e2e-*.mts
 *   pnpm e2e --filter comment-routing                 # 文件名子串匹配（不区分大小写）
 *   pnpm exec tsx scripts/run-e2e.mts --filter slice54
 *   pnpm e2e comment-routing                          # 兼容：裸关键词等同 --filter（pnpm 可能吞掉 --filter）
 *
 * 语义：
 *   1. 先探活 SERVER=http://127.0.0.1:3001/healthz（2s 超时）。
 *      - 无服 → 全部匹配脚本标 SKIP（绝不假绿，也不 FAIL）。
 *   2. 有服 → 串行 spawnSync('pnpm exec tsx scripts/<file>')，按退出码记 PASS/FAIL。
 *      - 兼容既有脚本自身退出码（它们已自产 PASS/FAIL 并 exit 1 on fail）。
 *   3. 汇总 PASS n / FAIL n / SKIP n；FAIL > 0 → 退出码 1；0 匹配 → 退出码 1（防假绿）。
 *
 * 子进程继承当前环境变量（SERVER / WEB / DB_PATH 等均可透传）。
 */

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = (process.env.SERVER ?? 'http://127.0.0.1:3001').replace(/\/+$/, '');
const HEALTHZ = `${SERVER}/healthz`;
const PROBE_TIMEOUT_MS = 2000;
const PER_SCRIPT_TIMEOUT_MS = 20 * 60 * 1000; // 单脚本上限 20min（playwright 慢套件兜底）

const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..'); // app/packages/server
const SCRIPTS_DIR = join(PACKAGE_DIR, 'scripts');

type Status = 'PASS' | 'FAIL' | 'SKIP';
interface RunResult {
  file: string;
  status: Status;
  note: string;
}

function resolveFilter(argv: string[]): string | undefined {
  const flagIdx = argv.indexOf('--filter');
  if (flagIdx !== -1) {
    const value = argv[flagIdx + 1];
    if (!value || value.startsWith('-')) {
      console.error('run-e2e: --filter 需要一个关键词参数（子串匹配脚本文件名）');
      process.exit(2);
    }
    return value;
  }
  // 兼容：pnpm 可能把 --filter 当自身参数吞掉，裸关键词兜底
  const bare = argv.find((a) => !a.startsWith('-'));
  return bare;
}

async function serverUp(): Promise<boolean> {
  try {
    const res = await fetch(HEALTHZ, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function runScript(file: string): RunResult {
  const child = spawnSync('pnpm', ['exec', 'tsx', `scripts/${file}`], {
    cwd: PACKAGE_DIR,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    timeout: PER_SCRIPT_TIMEOUT_MS,
    env: process.env,
  });
  if (child.error) {
    return { file, status: 'FAIL', note: `spawn error: ${child.error.message}` };
  }
  if (child.signal) {
    return { file, status: 'FAIL', note: `killed by ${child.signal}` };
  }
  return {
    file,
    status: child.status === 0 ? 'PASS' : 'FAIL',
    note: `exit=${child.status}`,
  };
}

async function main(): Promise<void> {
  const filter = resolveFilter(process.argv.slice(2));

  const all = readdirSync(SCRIPTS_DIR)
    .filter((f) => f.startsWith('e2e-') && f.endsWith('.mts'))
    .sort();

  const matched = filter
    ? all.filter((f) => f.toLowerCase().includes(filter.toLowerCase()))
    : all;

  if (matched.length === 0) {
    console.log(`\ne2e runner: --filter "${filter}" 匹配 0 个脚本（共 ${all.length} 个 e2e-*.mts）`);
    console.log('提示：filter 是脚本文件名的子串匹配（不区分大小写），如 comment-routing / slice54 / burst');
    process.exit(1); // 0 匹配 = 大概率手滑，拒绝假绿
  }

  console.log(
    `\ne2e runner · SERVER=${SERVER} · 匹配 ${matched.length}/${all.length} 个脚本${filter ? `（filter="${filter}"）` : ''}`,
  );
  const up = await serverUp();
  console.log(`探活 ${HEALTHZ} → ${up ? 'UP' : 'DOWN'}`);

  const results: RunResult[] = [];
  for (const file of matched) {
    if (!up) {
      results.push({
        file,
        status: 'SKIP',
        note: `SERVER 不可达 ${HEALTHZ}（SKIP，不粉饰为 PASS）`,
      });
      console.log(`[SKIP] ${file} — SERVER 不可达`);
      continue;
    }
    console.log(`\n────────────────── ▶ ${file}`);
    const result = runScript(file);
    results.push(result);
    console.log(`[${result.status}] ${file} — ${result.note}`);
  }

  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  console.log(`\n==== e2e runner 汇总: PASS ${pass} / FAIL ${fail} / SKIP ${skip} / total ${results.length} ====`);
  if (skip > 0) {
    console.log(`SKIP ${skip} 个：SERVER 不可达（不参与绿/红判定）`);
  }
  if (fail > 0) {
    console.error(`FAIL ${fail} 个 → 退出码 1`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('run-e2e crash:', e);
  process.exit(1);
});
