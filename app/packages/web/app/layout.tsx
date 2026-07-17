import './globals.css';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Providers } from '@/lib/providers';
import { Sidebar } from '@/components/Sidebar';

export const metadata: Metadata = {
  title: '毕设 Multi-Agent',
  description: '本地多智能体编排控制台',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>
          <div className="app-shell">
            <Suspense fallback={<aside className="sidebar" aria-label="主导航" />}>
              <Sidebar />
            </Suspense>
            <div className="main-column">
              <main className="main-content">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
