import './globals.css';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Providers } from '@/lib/providers';
import { EnvBanner } from '@/components/EnvBanner';
import { Sidebar } from '@/components/Sidebar';
import { HelperRail } from '@/components/HelperRail';

export const metadata: Metadata = {
  title: '毕设 Multi-Agent',
  description: '本地多智能体编排控制台',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('ma-theme');if(t!=='dark'&&t!=='light'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}if(t==='dark'){document.documentElement.classList.add('dark');document.documentElement.dataset.theme='dark'}else{document.documentElement.dataset.theme='light'}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <Providers>
          <div className="app-shell">
            <Suspense fallback={<aside className="sidebar" aria-label="主导航" />}>
              <Sidebar />
            </Suspense>
            <div className="main-column">
              <EnvBanner />
              <main className="main-content">{children}</main>
            </div>
            <HelperRail />
          </div>
        </Providers>
      </body>
    </html>
  );
}
