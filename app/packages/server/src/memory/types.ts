// S09 MemoryProvider 契约（spec §4.1，学 hermes ABC 裁剪）
export interface MemoryItemView {
  id: string;
  text: string;
  score?: number;
  source?: string;
  issueId?: string | null;
  runId?: string | null;
  createdAt?: string;
}

export interface MemoryPrefetchResult {
  items: MemoryItemView[];
}

export interface MemorySyncInput {
  sessionId: string;
  issueId: string;
  runId: string;
  agentId?: string | null;
  userText: string;
  assistantText: string;
}

export interface MemoryProvider {
  readonly name: string;
  isAvailable(): boolean;
  initialize(): void | Promise<void>;
  prefetch(
    query: string,
    opts?: { sessionId?: string; limit?: number },
  ): Promise<MemoryPrefetchResult>;
  /** 同步变体：S09 buildPrompt 用；默认可 throw 或委托 async */
  prefetchSync?(
    query: string,
    opts?: { sessionId?: string; limit?: number },
  ): MemoryPrefetchResult;
  syncTurn(input: MemorySyncInput): Promise<void>;
  /** 可选：按 id 删除（memory-item-delete） */
  deleteById?(id: string): boolean | Promise<boolean>;
  shutdown?(): void | Promise<void>;
}
