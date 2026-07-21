import { Suspense } from 'react';
import { SettingsPage } from '@/components/SettingsPage';

export default function Page() {
  return (
    <Suspense fallback={<div className="page-container">加载中…</div>}>
      <SettingsPage />
    </Suspense>
  );
}
