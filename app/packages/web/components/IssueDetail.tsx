'use client';
import { useIssue, useComments } from '@/lib/api';
import { IssueHeader } from './IssueHeader';
import { Timeline } from './Timeline';
import { CommentComposer } from './CommentComposer';
import { RunStatusBar } from './RunStatusBar';
import { RunTrace } from './RunTrace';

export function IssueDetail({ id }: { id: string }) {
  const { data: issue, isLoading: il, error: ie } = useIssue(id);
  const { data: comments, isLoading: cl } = useComments(id);

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
