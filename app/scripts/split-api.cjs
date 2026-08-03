/**
 * O3 一次性搬移脚本：把 web/lib/api.ts（3297 行）按领域拆到 lib/api/<domain>.ts，
 * api.ts 变为 barrel re-export。行为不变（纯物理搬移 + import 头重写）。
 * 行号基于 2026-08-03 api.ts 的 grep 边界。
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'packages', 'web', 'lib', 'api.ts');
const OUT_DIR = path.join(__dirname, '..', 'packages', 'web', 'lib', 'api');
const lines = fs.readFileSync(SRC, 'utf8').split('\n');

// 共享类型/工具名（从 api.ts 头部 import 提取）
const header = lines.slice(0, 83).join('\n');
const sharedTypes = [...header.matchAll(/^\s{2}([A-Z][A-Za-z0-9_]*),?$/gm)].map((m) => m[1].trim());
const localTools = [
  ['toastError', 'toastSuccess', '../toast'],
  ['withLocalTokenHeaders', '../local-token'],
  ['encodeFilenameHeader', '../attachment-upload'],
  ['mapIssueRows', 'optimisticOptions', 'removeIssueRows', '../optimistic'],
];

// 领域块（0-based 行区间 [start, end)）：grep 行号 N → index N-1
const CUTS = [
  { name: 'issues', from: 210, to: 1186 },
  { name: 'runs', from: 1186, to: 1568 },
  { name: 'skills', from: 1568, to: 1720 },
  { name: 'roster', from: 1720, to: 2186 },
  { name: 'wiki', from: 2186, to: 2391 },
  { name: 'memory', from: 2391, to: 2879 },
  { name: 'quick-runs', from: 2879, to: 2924 },
  { name: 'chat', from: 2924, to: 3101 },
  { name: 'automation', from: 3101, to: 3283 },
  { name: 'usage', from: 3283, to: lines.length },
];

function usedSharedTypes(blockText) {
  return sharedTypes.filter((t) => new RegExp(`\\b${t}\\b`).test(blockText));
}

function usedLocalTools(blockText) {
  return localTools.filter((entry) =>
    entry.slice(0, -1).some((n) => new RegExp(`\\b${n}\\b`).test(blockText)),
  );
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// http.ts：基础共享（apiFetch 等 84-210 区间内容，去 import 头）
const httpBlock = lines
  .slice(84 - 1, 210)
  .join('\n')
  // errMessage/apiError 原为 api.ts 内部函数，拆分后各领域模块需共享 → 导出
  .replace('function errMessage(', 'export function errMessage(')
  .replace('async function apiError(', 'export async function apiError(');
const httpImports = [];
if (/\btoastError\b/.test(httpBlock)) httpImports.push(`import { toastError } from '../toast';`);
if (/\bwithLocalTokenHeaders\b/.test(httpBlock)) {
  httpImports.push(`import { withLocalTokenHeaders } from '../local-token';`);
}
const httpTypes = usedSharedTypes(httpBlock);
if (httpTypes.length) {
  httpImports.push(
    `import type {\n${httpTypes.map((t) => `  ${t},`).join('\n')}\n} from '@ma/shared';`,
  );
}
const httpSrc = `'use client';
/**
 * O3 拆分：API 传输基础（apiFetch + 错误处理 + issues 查询参数）。
 * 由 lib/api.ts barrel 统一 re-export（调用方 import 面不变）。
 */
${httpImports.join('\n')}

${httpBlock}
`;
fs.writeFileSync(path.join(OUT_DIR, 'http.ts'), httpSrc);

// 各领域文件
for (const { name, from, to } of CUTS) {
  const blockText = lines.slice(from, to).join('\n');
  const types = usedSharedTypes(blockText);
  const tools = usedLocalTools(blockText);
  const imports = [];
  if (types.length) {
    imports.push(`import type {\n${types.map((t) => `  ${t},`).join('\n')}\n} from '@ma/shared';`);
  }
  imports.push(
    `import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';`,
  );
  imports.push(
    `import { apiFetch, API, errMessage, apiError } from './http';`,
  );
  if (/\btoastEnqueueMeta\b/.test(blockText)) {
    imports.push(`import { toastEnqueueMeta } from './http';`);
  }
  if (/\bIssuesQuery\b/.test(blockText) && name === 'issues') {
    imports.push(`import type { IssuesQuery, IssueWithEnqueue } from './http';`);
    imports.push(`import { issuesQueryKey, buildIssuesUrl } from './http';`);
  }
  for (const toolEntry of tools) {
    const names = toolEntry.slice(0, -1);
    const mod = toolEntry[toolEntry.length - 1];
    if (names.some((n) => new RegExp(`\\b${n}\\b`).test(blockText))) {
      imports.push(`import { ${names.join(', ')} } from '${mod}';`);
    }
  }
  const src = `'use client';
/**
 * O3 拆分：${name} 域 hooks（原 lib/api.ts ${from + 1}-${to} 行物理搬移）。
 * 由 lib/api.ts barrel 统一 re-export（调用方 import 面不变）。
 */
${imports.join('\n')}

${blockText}
`;
  fs.writeFileSync(path.join(OUT_DIR, `${name}.ts`), src);
}

// barrel api.ts
const barrel = `'use client';
/**
 * O3 拆分聚合（barrel）：各领域 hooks 从 lib/api/<domain>.ts 来。
 * 导出面与拆分前完全一致——调用方 import 不变。
 */
export * from './api/http';
export * from './api/issues';
export * from './api/runs';
export * from './api/skills';
export * from './api/roster';
export * from './api/wiki';
export * from './api/memory';
export * from './api/quick-runs';
export * from './api/chat';
export * from './api/automation';
export * from './api/usage';
`;
fs.writeFileSync(SRC, barrel);

console.log('done. files:', fs.readdirSync(OUT_DIR).join(', '));
console.log('api.ts now', barrel.split('\n').length, 'lines');
