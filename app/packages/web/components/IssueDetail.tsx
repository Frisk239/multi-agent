'use client';

import { useEffect, useMemo, useState } from 'react';
import { useComments, useIssue, useIssueRunUsage, useRuns } from '@/lib/api';
import { IssueHeader } from './IssueHeader';
import { Timeline } from './Timeline';
import { CommentComposer } from './CommentComposer';
import { RunStatusBar } from './RunStatusBar';
import { RunTrace } from './RunTrace';
import { IssueRunHistory } from './IssueRunHistory';
import { IssueSubtasks } from './IssueSubtasks';

function pickDefaultRunId(
  runs: { id: string; status: string }[],
): string | undefined {
  return (
    runs.find((r) => r.status === 'queued' || r.status === 'running')?.id ??
    runs[0]?.id
  );
}

export function IssueDetail({ id }: { id: string }) {
  const { data: issue, isLoading: il, error: ie } = useIssue(id);
  const { data: comments, isLoading: cl } = useComments(id);
  const { data: runs = [] } = useRuns(id);
  const { data: usage } = useIssueRunUsage(id);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();

  const defaultRunId = useMemo(() => pickDefaultRunId(runs), [runs]);

  // 默认选中活跃/最新；列表变化时纠正失效选择
  useEffect(() => {
    if (runs.length === 0) {
      setSelectedRunId(undefined);
      return;
    }
    setSelectedRunId((prev) => {
      if (prev && runs.some((r) => r.id === prev)) return prev;
      return defaultRunId;
    });
  }, [runs, defaultRunId]);

  const selectedRun = useMemo(
    () => runs.find((r) => r.id === selectedRunId),
    [runs, selectedRunId],
  );

  // 看板 live「进度」/ 标题 #run-trace：数据就绪后滚入轨迹
  useEffect(() => {
    if (il || cl || ie || !issue) return;
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#run-trace') return;
    const t = window.setTimeout(() => {
      document.getElementById('run-trace')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 80);
    return () => window.clearTimeout(t);
  }, [il, cl, ie, issue, id]);

  if (il || cl) return <div className="issue-detail">加载中…</div>;
  if (ie || !issue) return <div className="issue-detail">Issue 不存在</div>;

  return (
    <div className="issue-detail" data-testid="issue-detail">
      <IssueHeader issue={issue} />
      <IssueSubtasks parent={issue} />
      <RunStatusBar issueId={id} />
      <IssueRunHistory
        runs={runs}
        selectedRunId={selectedRunId}
        onSelect={setSelectedRunId}
        usage={usage}
      />
      <RunTrace run={selectedRun} />
      <Timeline items={comments ?? []} />
      <CommentComposer issueId={id} />
    </div>
  );
}
