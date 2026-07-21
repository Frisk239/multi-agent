import { RunDetailPage } from '@/components/RunDetailPage';

export default function Page({ params }: { params: { id: string } }) {
  return <RunDetailPage runId={params.id} />;
}
