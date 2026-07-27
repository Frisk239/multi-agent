'use client';

import { useEffect, useRef } from 'react';
import { useWsStore } from '@/lib/ws';
import { toastSuccess } from '@/lib/toast';

/**
 * Slice 34：WS 断线可行动条。
 * closed / connecting 时提示刷新；从断线态回到 open 时 toast 一次「实时连接已恢复」。
 */
export function WsConnectionBanner() {
  const status = useWsStore((s) => s.status);
  const hadOutageRef = useRef(false);
  const toastAtRef = useRef(0);

  useEffect(() => {
    if (status === 'closed' || status === 'connecting') {
      // 首次 connecting 不算断线（冷启动），只有先 open 过再掉线才记
      if (status === 'closed') {
        hadOutageRef.current = true;
      }
      return;
    }
    if (status === 'open' && hadOutageRef.current) {
      hadOutageRef.current = false;
      const now = Date.now();
      // 防抖：3s 内不重复 toast
      if (now - toastAtRef.current > 3000) {
        toastAtRef.current = now;
        toastSuccess('实时连接已恢复');
      }
    }
  }, [status]);

  if (status === 'open') return null;

  const title =
    status === 'closed' ? '实时连接已断开' : '正在连接实时通道…';
  const detail =
    status === 'closed'
      ? '列表与运行状态可能落后，可刷新本页重连'
      : '若长时间停留在此，请刷新本页';

  return (
    <div
      className="ws-connection-banner"
      data-testid="ws-connection-banner"
      data-status={status}
      role="status"
    >
      <div className="ws-connection-banner-main">
        <strong>{title}</strong>
        <span className="text-dim">{detail}</span>
      </div>
      <div className="ws-connection-banner-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          data-testid="ws-connection-refresh"
          onClick={() => {
            if (typeof window !== 'undefined') window.location.reload();
          }}
        >
          刷新本页
        </button>
      </div>
    </div>
  );
}
