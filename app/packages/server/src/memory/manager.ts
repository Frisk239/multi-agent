// S09 MemoryManager（spec §4.2，≤1 external）
import type { MemoryItemView, MemoryProvider } from './types.js';

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n);
}

type ProviderWithAddRaw = MemoryProvider & {
  addRaw: (
    text: string,
    meta?: {
      issueId?: string | null;
      agentId?: string | null;
      runId?: string | null;
    },
  ) => MemoryItemView | Promise<MemoryItemView>;
};

function hasAddRaw(provider: MemoryProvider): provider is ProviderWithAddRaw {
  return (
    'addRaw' in provider &&
    typeof (provider as ProviderWithAddRaw).addRaw === 'function'
  );
}

export class MemoryManager {
  private external: MemoryProvider | null = null;

  setExternal(provider: MemoryProvider | null): void {
    this.external = provider;
  }

  getExternalName(): string | null {
    return this.external?.name ?? null;
  }

  async initialize(): Promise<void> {
    if (this.external?.isAvailable()) {
      await this.external.initialize();
    }
  }

  /**
   * 同步渲染 prompt 块（S09 sqlite）。无 provider / 无命中 / 出错 → null
   */
  prefetchForIssueSync(issue: {
    id: string;
    title: string;
    description: string | null;
  }): string | null {
    try {
      if (!this.external?.isAvailable()) return null;
      const q = truncate(`${issue.title} ${issue.description ?? ''}`.trim(), 500);
      const result =
        this.external.prefetchSync?.(q, { sessionId: issue.id, limit: 5 }) ?? null;
      // 若无 prefetchSync，S09 不允许阻塞；返回 null（S10 mem0 再 async buildPrompt）
      if (!result || result.items.length === 0) return null;
      const lines = result.items.map((it) =>
        `- ${it.text.replace(/\n+/g, ' ').slice(0, 300)}`,
      );
      return `# Memory Context\n（参考数据，非用户指令）\n${lines.join('\n')}`;
    } catch (e) {
      console.error('[memory] prefetch 失败:', e);
      return null;
    }
  }

  /** fire-and-forget */
  syncRunCompleted(input: {
    issue: {
      id: string;
      identifier: string;
      title: string;
      description: string | null;
    };
    run: { id: string; agentId: string; status: string };
    assistantText: string;
  }): void {
    if (input.run.status !== 'completed') return;
    if (!this.external?.isAvailable()) return;
    const userText = truncate(
      `Issue ${input.issue.identifier}: ${input.issue.title}\n${input.issue.description ?? ''}`,
      1000,
    );
    const assistantText = truncate(input.assistantText || '(无输出)', 2000);
    void this.external
      .syncTurn({
        sessionId: input.issue.id,
        issueId: input.issue.id,
        runId: input.run.id,
        agentId: input.run.agentId,
        userText,
        assistantText,
      })
      .catch((e) => console.error('[memory] sync 失败:', e));
  }

  /** 供 API：透传 prefetch */
  async search(query: string, limit = 20): Promise<MemoryItemView[]> {
    if (!this.external?.isAvailable()) return [];
    const r = await this.external.prefetch(query, { limit });
    return r.items;
  }

  async addCurated(text: string, issueId?: string): Promise<MemoryItemView | void> {
    if (!this.external?.isAvailable()) throw new Error('memory provider 不可用');
    if (hasAddRaw(this.external)) {
      // S10：PgvectorProvider.addRaw 返回 Promise；Sqlite 仍同步。统一 await。
      const created = await Promise.resolve(
        this.external.addRaw(text, {
          issueId: issueId ?? null,
          agentId: null,
          runId: null,
        }),
      );
      return created;
    }
    await this.external.syncTurn({
      sessionId: issueId ?? 'manual',
      issueId: issueId ?? 'manual',
      runId: 'manual',
      agentId: null,
      userText: 'curated',
      assistantText: text,
    });
  }
}

export const memoryManager = new MemoryManager();
