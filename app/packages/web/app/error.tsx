'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="app-error" role="alert">
      <h1 className="app-error-title">出了点问题</h1>
      <p className="app-error-message">{error.message || '页面渲染失败'}</p>
      <button type="button" className="btn-primary" onClick={() => reset()}>
        重试
      </button>
    </div>
  );
}
