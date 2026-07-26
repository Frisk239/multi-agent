'use client';

import { Suspense } from 'react';
import { TokenCostDashboard } from './TokenCostDashboard';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';

export function AnalyticsPage() {
  return (
    <div className="page-container collection-page analytics-page" data-testid="analytics-page">
      <div className="page-header">
        <div>
          <Icon name="usage" size={16} className="page-header-icon" />
          <h1 className="page-title">
            分析与成本
          </h1>
          <p className="page-desc">
            Token 消耗归因与推估 USD 费用面板
          </p>
        </div>
      </div>

      <div className="page-body">
        <Suspense fallback={<EmptyState title="加载分析面板…" />}>
          <TokenCostDashboard defaultDays={30} defaultGroupBy="agent" />
        </Suspense>
      </div>
    </div>
  );
}
