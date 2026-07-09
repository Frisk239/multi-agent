'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useWsEvents } from './ws';

function WsMount() {
  useWsEvents(); // 挂载时建立 WS 连接 + 监听
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false, staleTime: Infinity },
        },
      }),
  );
  return (
    <QueryClientProvider client={qc}>
      <WsMount />
      {children}
    </QueryClientProvider>
  );
}
