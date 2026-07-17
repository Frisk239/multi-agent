'use client';

import { useEffect } from 'react';
import { useIssue, useComments } from '@/lib/api';
import { IssueHeader } from './IssueHeader';
import { Timeline } from './Timeline';
import { CommentComposer } from './CommentComposer';
import { RunStatusBar } from './RunStatusBar';
import { RunTrace } from './RunTrace';

export function IssueDetail({ id }: { id: string }) {
  const { data: issue, isLoading: il, error: ie } = useIssue(id);
  const { data: comments, isLoading: cl } = useComments(id);

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
    <div className="issue-detail">
      <IssueHeader issue={issue} />
      <RunStatusBar issueId={id} />
      <RunTrace issueId={id} />
      <Timeline items={comments ?? []} />
      <CommentComposer issueId={id} />
    </div>
  );
}
