'use client';

/**
 * 路由级 error boundary（在 root layout 的 Providers 内）。
 * 勿命名/伪装 global-error：global-error 会替换整个 html，易脱离 QueryClient。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="app-error surface-card" role="alert" data-testid="app-error">
      <h1 className="app-error-title">出了点问题</h1>
      <p className="app-error-message">{error.message || '页面渲染失败'}</p>
      <div className="app-error-actions">
        <button type="button" className="btn-primary" onClick={() => reset()}>
          重试
        </button>
        <a href="/" className="btn-ghost btn-sm">
          回首页
        </a>
      </div>
    </div>
  );
}
