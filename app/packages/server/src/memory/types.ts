// S09 MemoryProvider 契约（spec §4.1，学 hermes ABC 裁剪）
import type { MemoryScope } from '@ma/shared';

export interface MemoryItemView {
  id: string;
  text: string;
  score?: number;
  source?: string;
  /** G4-4：四级 scope 标签（workspace/agent/issue/run） */
  scope?: string | null;
  issueId?: string | null;
  runId?: string | null;
  createdAt?: string;
  validAt?: string | null;
  invalidAt?: string | null;
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
  /** G4-4：run 完成记忆默认 run scope */
  scope?: MemoryScope | null;
}

/** G4-4：检索可选的 scope 过滤（传入则只召回该 scope） */
export type MemoryPrefetchScope = MemoryScope | null | undefined;

export interface MemoryProvider {
  readonly name: string;
  isAvailable(): boolean;
  initialize(): void | Promise<void>;
  prefetch(
    query: string,
    opts?: { sessionId?: string; limit?: number; includeInvalid?: boolean; scope?: MemoryPrefetchScope },
  ): Promise<MemoryPrefetchResult>;
  /** 同步变体：S09 buildPrompt 用；默认可 throw 或委托 async */
  prefetchSync?(
    query: string,
    opts?: { sessionId?: string; limit?: number; includeInvalid?: boolean; scope?: MemoryPrefetchScope },
  ): MemoryPrefetchResult;
  syncTurn(input: MemorySyncInput): Promise<void>;
  /** 可选：按 id 删除（memory-item-delete） */
  deleteById?(id: string): boolean | Promise<boolean>;
  /** 可选：按 id 取全文（详情抽屉） */
  getById?(id: string): MemoryItemView | null | Promise<MemoryItemView | null>;
  /** 设为失效（Phase B Slice 3: Temporal Validity） */
  invalidateMemory?(id: string): boolean | Promise<boolean>;
  shutdown?(): void | Promise<void>;
}
