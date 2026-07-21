import { SkillDetailPage } from '@/components/SkillDetailPage';

export default function Page({ params }: { params: { name: string } }) {
  return <SkillDetailPage name={params.name} />;
}
