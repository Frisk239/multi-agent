import { ProjectDetailPage } from '@/components/ProjectDetailPage';

export default function Page({ params }: { params: { id: string } }) {
  return <ProjectDetailPage id={params.id} />;
}
