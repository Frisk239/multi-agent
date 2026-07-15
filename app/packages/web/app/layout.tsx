import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Providers } from '@/lib/providers';

export const metadata: Metadata = {
  title: '毕设 Multi-Agent',
  description: '本地多智能体编排控制台',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>
          <nav className="topnav">
            <Link href="/">看板</Link>
            <span className="topnav-sep">|</span>
            <Link href="/runtimes">运行时</Link>
          </nav>
          {children}
        </Providers>
      </body>
    </html>
  );
}
