'use client';

import Link from 'next/link';
import { useSkill } from '@/lib/api';
import { MarkdownBody } from './MarkdownBody';
import { PageBreadcrumb } from './PageBreadcrumb';

/**
 * Multica 式 skill 详情：正文 + 元数据 + 只读 usedBy（不在此跳 agent）
 */
export function SkillDetailPage({ name }: { name: string }) {
  const decoded = decodeURIComponent(name);
  const { data, isLoading, isError, error } = useSkill(decoded);

  if (isLoading) {
    return <div className="page-container">加载 skill…</div>;
  }
  if (isError || !data) {
    return (
      <div className="page-container skill-detail-page" data-testid="skill-detail-page">
        <PageBreadcrumb
          items={[{ label: 'Skills', href: '/skills' }, { label: decoded }]}
        />
        <p className="text-dim">
          {error instanceof Error ? error.message : 'skill 不存在'}
        </p>
        <Link href="/skills" className="btn btn-primary btn-sm">
          返回列表
        </Link>
      </div>
    );
  }

  return (
    <div
      className="page-container skill-detail-page"
      data-testid="skill-detail-page"
      data-skill-name={data.name}
    >
      <div className="skill-detail-top">
        <PageBreadcrumb
          testId="skill-detail-breadcrumb"
          items={[{ label: 'Skills', href: '/skills' }, { label: data.name }]}
        />
      </div>

      <div className="skill-detail-layout">
        <div className="skill-detail-main">
          <header className="skill-detail-header">
            <h1 className="skill-detail-title">{data.name}</h1>
            {data.description ? (
              <p className="skill-detail-desc" data-testid="skill-detail-desc">
                {data.description}
              </p>
            ) : null}
            <div className="skill-detail-chips">
              <span
                className={`source-badge source-${data.source}`}
                data-testid="skill-detail-source"
              >
                {data.source === 'project' ? '项目级' : '用户级'}
              </span>
              <span className="text-dim text-sm" title={data.path}>
                {data.path}
              </span>
            </div>
          </header>

          <section className="skill-detail-body" data-testid="skill-detail-body">
            <div className="skill-detail-body-label">SKILL.md</div>
            <div className="skill-detail-md">
              <MarkdownBody source={data.body || '_（空）_'} />
            </div>
          </section>
        </div>

        <aside className="skill-detail-rail" data-testid="skill-detail-rail">
          <div className="skill-detail-rail-block">
            <h2 className="skill-detail-rail-title">元数据</h2>
            <dl className="skill-detail-meta">
              <div>
                <dt>名称</dt>
                <dd>{data.name}</dd>
              </div>
              <div>
                <dt>来源</dt>
                <dd>{data.source === 'project' ? '项目 .skills' : '用户 skills'}</dd>
              </div>
              <div>
                <dt>路径</dt>
                <dd className="skill-detail-path">{data.path}</dd>
              </div>
            </dl>
          </div>

          <div className="skill-detail-rail-block">
            <h2 className="skill-detail-rail-title">
              被谁使用
              <span className="count">{data.usedBy.length}</span>
            </h2>
            {data.usedBy.length === 0 ? (
              <p className="text-dim text-sm" data-testid="skill-detail-unused">
                尚未分配给任何智能体
              </p>
            ) : (
              <ul className="skill-detail-usedby" data-testid="skill-detail-usedby">
                {data.usedBy.map((a) => (
                  <li key={a.id} className="skill-detail-usedby-item">
                    <span className="skills-usedby-avatar" aria-hidden>
                      {a.name.slice(0, 1)}
                    </span>
                    <span className="skill-detail-usedby-text">
                      <span className="skill-detail-usedby-name">{a.name}</span>
                      <span className="text-dim text-sm">{a.runtime}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-dim text-sm skill-detail-usedby-hint">
              只读展示。在智能体「能力」页绑定 skill。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
