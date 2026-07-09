'use client';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import type { Components } from 'react-markdown';

const MENTION_RE = /^mention:\/\/(agent|squad)\/(.+)$/;

/** react-markdown 默认只放行 http(s)/mailto 等；mention:// 需显式保留 */
function urlTransform(url: string) {
  if (url.startsWith('mention://')) return url;
  return defaultUrlTransform(url);
}

const components: Components = {
  a: ({ href, children }) => {
    if (href && MENTION_RE.test(href)) {
      const text = String(children ?? href);
      return <span className="mention-pill">{text.startsWith('@') ? text : `@${text}`}</span>;
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
