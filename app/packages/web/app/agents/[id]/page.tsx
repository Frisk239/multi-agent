import { AgentDetailPage } from '@/components/AgentDetailPage';

export default function Page({ params }: { params: { id: string } }) {
  return <AgentDetailPage agentId={params.id} />;
}
