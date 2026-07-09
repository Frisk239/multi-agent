import { IssueDetail } from '@/components/IssueDetail';

export default function Page({ params }: { params: { id: string } }) {
  return <IssueDetail id={params.id} />;
}
