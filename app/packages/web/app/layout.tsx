import './globals.css';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Providers } from '@/lib/providers';
import { EnvBanner } from '@/components/EnvBanner';
import { OnboardingCard } from '@/components/OnboardingCard';
import { Sidebar } from '@/components/Sidebar';
import { HelperRail } from '@/components/HelperRail';
import { ErrorBoundary } from '@/components/ErrorBoundary';


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
        {/* 全部 client hooks（含 HelperRail / useQuery）必须在 Providers 内，避免 error boundary 后 HMR 脱挂 */}
        <ErrorBoundary fallback={
          <div style={{ padding: 24, textAlign: 'center', marginTop: '20vh' }}>
            <h2 style={{ marginBottom: 16 }}>应用崩溃了 (Global Error)</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>发生了未捕获的渲染错误，您可以尝试刷新页面。</p>
            <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', cursor: 'pointer', background: 'var(--text)', color: 'var(--bg)' }}>刷新页面</button>
          </div>
        }>
          <Providers>
            <div className="app-shell">
              <Suspense fallback={<aside className="sidebar" aria-label="主导航" />}>
                <Sidebar />
              </Suspense>
              <div className="main-column">
                <EnvBanner />
                <main className="main-content">
                  <Suspense fallback={null}>
                    <OnboardingCard />
                  </Suspense>
                  {children}
                </main>
              </div>
              <Suspense fallback={null}>
                <HelperRail />
              </Suspense>
            </div>
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
