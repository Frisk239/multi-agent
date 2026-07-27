/**
 * Slice 54 · Mention chips 薄版（U13）
 * 从评论 markdown 解析 sticky mention chips；删 chip 同步去掉对应 mention 语法。
 * 语法与 CommentComposer / MarkdownBody / comment-trigger 对齐：
 *   [@Label](mention://agent|squad/<id>)
 */

export type MentionChip = {
  /** target id（agent / squad id） */
  id: string;
  kind: 'agent' | 'squad';
  /** 展示标签，含或不含 @ 均可；chip UI 统一加 @ */
  label: string;
  /** 原文 markdown 片段 */
  raw: string;
};

/** 全局匹配 [@label](mention://agent|squad/id) */
const MENTION_MD_RE =
  /\[@([^\]]+)\]\(mention:\/\/(agent|squad)\/([\w-]+)\)/g;

/**
 * 从 body 解析去重后的 mention chips（按出现顺序，同 kind+id 只保留首次）。
 */
export function parseMentionChips(body: string): MentionChip[] {
  if (!body) return [];
  const chips: MentionChip[] = [];
  const seen = new Set<string>();
  MENTION_MD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_MD_RE.exec(body)) !== null) {
    const label = m[1] ?? '';
    const kind = (m[2] === 'squad' ? 'squad' : 'agent') as 'agent' | 'squad';
    const id = m[3] ?? '';
    if (!id) continue;
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push({
      id,
      kind,
      label,
      raw: m[0],
    });
  }
  return chips;
}

/**
 * 从 body 去掉指定 id 的所有 mention markdown（agent/squad 同 id 一并去掉）。
 * 顺带折叠多余空格；不吞换行。
 */
export function removeMentionFromBody(body: string, id: string): string {
  if (!body || !id) return body ?? '';
  // 转义 id 用于字符类外字面量
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `\\[@[^\\]]+\\]\\(mention:\\/\\/(?:agent|squad)\\/${escaped}\\)`,
    'g',
  );
  let next = body.replace(re, '');
  // 行内多空格压成单空格（保留换行）
  next = next
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+|[ \t]+$/g, ''))
    .join('\n');
  return next;
}
