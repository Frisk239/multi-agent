'use client';

import React, { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  resetKeys?: any[];
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && this.props.resetKeys && prevProps.resetKeys) {
      const keysChanged = this.props.resetKeys.length !== prevProps.resetKeys.length ||
        this.props.resetKeys.some((key, index) => key !== prevProps.resetKeys![index]);
      
      if (keysChanged) {
        this.setState({ hasError: false, error: null });
      }
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          padding: '16px',
          margin: '16px 0',
          borderRadius: '8px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--error)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span style={{ fontWeight: 500 }}>渲染出错</span>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {this.state.error?.message || '未知错误'}
          </div>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '6px 12px',
              backgroundColor: 'var(--surface-hover)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500
            }}
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
