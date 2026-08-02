/**
 * G4-2：流式围栏 scrubber（学 hermes StreamingContextScrubber，
 * references/repos/hermes-agent/agent/memory_manager.py:171）。
 *
 * 问题：prompt 注入有围栏（<retrieved-context>/<context-fence>/<think>），但 CLI
 * 回显 user prompt 时会原样流进 UI/回放 —— 围栏标签与系统注入内容泄漏。
 * 一次性正则无法跨 chunk 边界（开标签在一个 delta、闭标签在另一个 delta 时状态损坏，
 * hermes memory_manager.py:174-179 明言）→ 有状态状态机。
 *
 * 边界：只剥「块起始 + 标签后跟换行」的围栏（hermes 同款块边界检查，防正文误剥）；
 * 未闭合的 span 在 flush 时整体丢弃（漏半截围栏比截断回答更糟，hermes 同语义）。
 */

const FENCE_TAGS = ['retrieved-context', 'context-fence', 'think'] as const;
const OPEN_RE = /<(retrieved-context|context-fence|think)(\s[^>]*)?>/i;
const CLOSE_RE = /<\/(retrieved-context|context-fence|think)>/i;

export class StreamScrubber {
  private inSpan: string | null = null;
  private buf = '';
  private atBlockBoundary = true;

  reset(): void {
    this.inSpan = null;
    this.buf = '';
    this.atBlockBoundary = true;
  }

  /** 返回剥离后的可见部分；跨 chunk 的部分标签尾部被持有，随下次 feed/flush 处理 */
  feed(text: string): string {
    if (!text) return '';
    let buf = this.buf + text;
    this.buf = '';
    const out: string[] = [];

    while (buf) {
      if (this.inSpan) {
        const closeTag = `</${this.inSpan}>`;
        const idx = buf.toLowerCase().indexOf(closeTag.toLowerCase());
        if (idx === -1) {
          // 持有可能是闭标签前缀的尾部，其余丢弃
          const held = this.maxPartialSuffix(buf, closeTag);
          this.buf = held > 0 ? buf.slice(-held) : '';
          return out.join('');
        }
        buf = buf.slice(idx + closeTag.length);
        this.inSpan = null;
        continue;
      }
      const open = this.findBoundaryOpenTag(buf);
      if (open.idx === -1) {
        // 无开标签：持有可能是任一开标签前缀的尾部
        let held = 0;
        for (const t of FENCE_TAGS) {
          held = Math.max(held, this.maxPartialSuffix(buf, `<${t}`));
        }
        if (this.pendingCompleteOpenTag(buf)) {
          held = Math.max(held, this.pendingCompleteOpenTag(buf)!);
        }
        if (held > 0) {
          this.appendVisible(out, buf.slice(0, -held));
          this.buf = buf.slice(-held);
        } else {
          this.appendVisible(out, buf);
        }
        return out.join('');
      }
      if (open.idx > 0) this.appendVisible(out, buf.slice(0, open.idx));
      buf = buf.slice(open.idx + open.tag.length);
      this.inSpan = open.name;
    }
    return out.join('');
  }

  /** 流结束时调用：未闭合 span 丢弃；持有的部分标签尾部按原样放出 */
  flush(): string {
    if (this.inSpan) {
      this.buf = '';
      this.inSpan = null;
      return '';
    }
    const tail = this.buf;
    this.buf = '';
    return tail;
  }

  // ---- helpers ----

  /** 最长 buf 后缀且是 tag 前缀（大小写不敏感）；无则 0 */
  private maxPartialSuffix(buf: string, tag: string): number {
    const lower = buf.toLowerCase();
    const tagLower = tag.toLowerCase();
    const maxCheck = Math.min(lower.length, tagLower.length - 1);
    for (let i = maxCheck; i > 0; i--) {
      if (tagLower.startsWith(lower.slice(-i))) return i;
    }
    return 0;
  }

  /** buf 尾部恰好是一个完整开标签（等下一个字符确认是否真围栏）→ 返回持有长度 */
  private pendingCompleteOpenTag(buf: string): number | null {
    for (const t of FENCE_TAGS) {
      const tag = `<${t}`;
      if (buf.toLowerCase().endsWith(tag.toLowerCase()) && this.isBlockBoundary(buf, buf.length - tag.length)) {
        return tag.length;
      }
    }
    return null;
  }

  /** 找「块起始 + 标签后跟换行/串尾」的开标签 */
  private findBoundaryOpenTag(buf: string): { idx: number; name: string; tag: string } {
    const lower = buf.toLowerCase();
    let searchStart = 0;
    while (true) {
      const m = OPEN_RE.exec(lower.slice(searchStart));
      if (!m) return { idx: -1, name: '', tag: '' };
      const idx = searchStart + (m.index ?? 0);
      const fullTag = buf.slice(idx, idx + m[0].length);
      if (
        this.isBlockBoundary(buf, idx) &&
        this.hasBlockOpenerSuffix(buf, idx + fullTag.length)
      ) {
        return { idx, name: m[1].toLowerCase(), tag: fullTag };
      }
      searchStart = idx + 1;
    }
  }

  private hasBlockOpenerSuffix(buf: string, afterIdx: number): boolean {
    if (afterIdx >= buf.length) return true; // 标签到 chunk 尾：等下一 chunk 确认（先不剥）
    return buf[afterIdx] === '\n' || buf[afterIdx] === '\r';
  }

  private isBlockBoundary(buf: string, idx: number): boolean {
    if (idx <= 0) return this.atBlockBoundary;
    const preceding = buf.slice(0, idx);
    const lastNewline = preceding.lastIndexOf('\n');
    if (lastNewline === -1) return this.atBlockBoundary && preceding.trim() === '';
    return preceding.slice(lastNewline + 1).trim() === '';
  }

  private appendVisible(out: string[], text: string): void {
    if (!text) return;
    out.push(text);
    const lastNewline = text.lastIndexOf('\n');
    if (lastNewline !== -1) {
      this.atBlockBoundary = text.slice(lastNewline + 1).trim() === '';
    } else {
      this.atBlockBoundary = this.atBlockBoundary && text.trim() === '';
    }
  }
}

/** 一次性剥离（整条文本，如 user 回显的完整 prompt / message_end 整条） */
export function scrubFences(text: string): string {
  const s = new StreamScrubber();
  return s.feed(text) + s.flush();
}
