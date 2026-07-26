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
          const boardHref =
            kind === 'agent'
              ? `/?assignee=agent:${encodeURIComponent(id)}`
              : `/?assignee=squad:${encodeURIComponent(id)}`;
          const runsHref =
            kind === 'agent'
              ? `/runs?agent=${encodeURIComponent(id)}`
              : `/runs?squad=${encodeURIComponent(id)}`;
          return (
            <span className="mention-pill-group" data-testid="mention-group">
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
              <Link
                href={boardHref}
                className="mention-side-link"
                data-testid="mention-board-link"
                data-mention-kind={kind}
                data-mention-id={id}
                title="看板筛选此指派"
              >
                看板
              </Link>
              <Link
                href={runsHref}
                className="mention-side-link"
                data-testid="mention-runs-link"
                data-mention-kind={kind}
                data-mention-id={id}
                title="查看相关运行"
              >
                运行
              </Link>
            </span>
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

type Chunk = { type: 'text'; content: string } | { type: 'fence'; kind: string; title: string; content: string; closed: boolean };

function parseContextFences(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  let remaining = text;
  
  const START_RE = /<context-fence\s+kind="([^"]+)"\s+title="([^"]+)">/i;
  const END_RE = /<\/context-fence>/i;
  
  while (remaining.length > 0) {
    const match = remaining.match(START_RE);
    if (!match || match.index === undefined) {
      chunks.push({ type: 'text', content: remaining });
      break;
    }
    
    if (match.index > 0) {
      chunks.push({ type: 'text', content: remaining.slice(0, match.index) });
    }
    
    const kind = match[1]!;
    const title = match[2]!;
    const afterStart = remaining.slice(match.index + match[0].length);
    
    const endMatch = afterStart.match(END_RE);
    if (endMatch && endMatch.index !== undefined) {
      chunks.push({
        type: 'fence',
        kind,
        title,
        content: afterStart.slice(0, endMatch.index),
        closed: true
      });
      remaining = afterStart.slice(endMatch.index + endMatch[0].length);
    } else {
      chunks.push({
        type: 'fence',
        kind,
        title,
        content: afterStart,
        closed: false
      });
      break;
    }
  }
  
  return chunks;
}

import { useState } from 'react';

function ContextFenceBlock({ chunk }: { chunk: Chunk & { type: 'fence' } }) {
  const [open, setOpen] = useState(false);
  const isMem = chunk.kind === 'memory';
  const isWiki = chunk.kind === 'wiki';
  
  let label = `已自动注入 ${chunk.title}`;
  if (isMem) label = '🧠 已自动注入 Memory 知识';
  if (isWiki) label = '📚 已自动注入 Wiki 知识';
  
  return (
    <div className="my-3 border rounded-md overflow-hidden bg-gray-50/50 border-gray-200">
      <button 
        type="button" 
        onClick={() => setOpen(!open)}
        className="w-full text-left px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 flex justify-between items-center"
      >
        <span>
          {label} 
          {!chunk.closed && <span className="ml-2 text-xs text-blue-500 animate-pulse">正在读取...</span>}
        </span>
        <span className="text-gray-400 text-xs">{open ? '收起' : '点击展开'}</span>
      </button>
      {open && (
        <div className="p-3 border-t border-gray-200 text-sm bg-white overflow-auto max-h-96 md-body">
          <ReactMarkdown components={components} urlTransform={urlTransform}>
            {chunk.content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

export function MarkdownBody({ source }: { source: string }) {
  const chunks = parseContextFences(source);
  
  return (
    <div className="md-body">
      {chunks.map((c, i) => {
        if (c.type === 'text') {
          return (
            <ReactMarkdown key={i} components={components} urlTransform={urlTransform}>
              {c.content}
            </ReactMarkdown>
          );
        }
        return <ContextFenceBlock key={i} chunk={c} />;
      })}
    </div>
  );
}
