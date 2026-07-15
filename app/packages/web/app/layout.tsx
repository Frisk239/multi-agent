import './globals.css';
import type { Metadata } from 'next';
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
            <Sidebar />
            <div className="main-column">
              <main className="main-content">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
