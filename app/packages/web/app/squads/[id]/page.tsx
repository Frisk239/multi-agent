import { SquadDetailPage } from '@/components/SquadDetailPage';

export default function Page({ params }: { params: { id: string } }) {
  return <SquadDetailPage squadId={params.id} />;
}
