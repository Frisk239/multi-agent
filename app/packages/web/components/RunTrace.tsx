'use client';
import { useRuns, useRunMessages } from '@/lib/api';

export function RunTrace({ issueId }: { issueId: string }) {
  const { data: runs = [] } = useRuns(issueId);
  const runId = runs[0]?.id;
  const run = runs[0];
  const { data: messages = [] } = useRunMessages(runId);

  if (!runId) return null;

  return (
    <section className="run-trace">
      <h3>运行轨迹</h3>
      {messages.length === 0 ? (
        <p className="run-trace-empty">
          {run && (run.status === 'queued' || run.status === 'running')
            ? '执行中…（部分 runtime 如 opencode 执行期间无实时轨迹，结束时才会有摘要，属正常）'
            : '无轨迹消息'}
        </p>
      ) : (
        <ul className="run-trace-list">
          {messages.map((m) => (
            <li key={m.id} className="run-trace-item" data-kind={m.kind}>
              <code>#{m.seq}</code> <strong>{m.kind}</strong>{' '}
              <span className="run-trace-body">{m.body.slice(0, 500)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
