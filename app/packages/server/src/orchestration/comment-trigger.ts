import type { Comment } from '@ma/shared';
import { enqueueAgentRun, enqueueLeaderRun } from './run-service.js';
import { getSquadLeaderId } from '../db/squad-loader.js';

// comment-trigger —— comment 创建后解析 mention link 派任务（spec §7）。
// 挂接点：人工 comment（comments.ts POST）+ agent 终态 comment（run-worker.ts completed）。
// 循环 import 安全（排雷补充#2）：comment-trigger → run-service → run-worker → comment-trigger
//   形成循环，但所有交叉引用（enqueueAgentRun/enqueueLeaderRun/triggerFromComment）
//   只在各自函数体内调用，不在模块顶层立即求值，ES module live binding 使其安全。

// 解析 comment body 的 mention link（spec §7.1）。
// 格式：[@Name](mention://agent/<id>) 或 [@Name](mention://squad/<id>)
function parseMentions(
  body: string,
): Array<{ kind: 'agent' | 'squad'; id: string }> {
  const re = /mention:\/\/(agent|squad)\/([\w-]+)/g;
  const results: Array<{ kind: 'agent' | 'squad'; id: string }> = [];
  let match;
  while ((match = re.exec(body)) !== null) {
    results.push({ kind: match[1] as 'agent' | 'squad', id: match[2] });
  }
  // 去重（同一条 comment @同一个 target 多次只排一次）
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.kind}:${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// triggerFromComment —— comment 创建后触发任务派发（spec §7）。
export function triggerFromComment(comment: Comment): void {
  // R4：只处理普通 comment（status_change 的 body 是 JSON，不含 mention）
  if (comment.type !== 'comment') return;

  const mentions = parseMentions(comment.body);

  for (const m of mentions) {
    if (m.kind === 'agent') {
      // S8：@agent 自指放行（照 multica comment.go:2177，cross-issue 自触发是 feature）
      // 防循环靠 per-(issue,agent) 去重 + 熔断，不靠 author 判定
      enqueueAgentRun(comment.issueId, m.id);
    } else if (m.kind === 'squad') {
      const leaderId = getSquadLeaderId(m.id);
      if (!leaderId) continue;
      // S8：@squad leader 自指跳过（防 leader @自己小队 → 触发自己 → 循环）
      // 简化判定（leader/worker 不重叠）：authorId === leaderId 则跳过
      if (comment.authorType === 'agent' && comment.authorId === leaderId) continue;
      enqueueLeaderRun(comment.issueId, leaderId, m.id);
    }
  }
}
