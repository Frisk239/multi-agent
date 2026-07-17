'use client';
import Link from 'next/link';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import type { Components } from 'react-markdown';

const MENTION_RE = /^mention:\/\/(agent|squad)\/(.+)$/;

/** react-markdown 默认只放行 http(s)/mailto 等；mention:// 需显式保留 */
function urlTransform(url: string) {
  if (url.startsWith('mention://')) return url;
  return defaultUrlTransform(url);
}

function mentionHref(kind: string, id: string): string | null {
  if (kind === 'agent') return `/agents/${id}`;
  if (kind === 'squad') return `/squads/${id}`;
  return null;
}

const components: Components = {
  a: ({ href, children }) => {
    if (href) {
      const m = href.match(MENTION_RE);
      if (m) {
        const kind = m[1]!;
        const id = m[2]!;
        const text = String(children ?? href);
        const label = text.startsWith('@') ? text : `@${text}`;
        const to = mentionHref(kind, id);
        if (to) {
          return (
            <Link
              href={to}
              className="mention-pill mention-pill--link"
              data-testid="mention-link"
              data-mention-kind={kind}
              data-mention-id={id}
              title={kind === 'agent' ? '打开智能体' : '打开小队'}
            >
              {label}
            </Link>
          );
        }
        return (
          <span className="mention-pill" data-mention-kind={kind} data-mention-id={id}>
            {label}
          </span>
        );
      }
    }
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
};

export function MarkdownBody({ source }: { source: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown components={components} urlTransform={urlTransform}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
