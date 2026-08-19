/**
 * Slice 45 · 本地草稿持久化（localStorage）
 * SSR / 隐私模式安全：无 window 或 storage 抛错时 no-op。
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

export const DRAFT_PREFIX = 'ma-draft:';

export const draftKey = {
  comment: (issueId: string) => `${DRAFT_PREFIX}comment:${issueId}`,
  /** 根评论与任一根下的回复草稿必须隔离，避免切换回复对象时串写。 */
  commentReply: (issueId: string, parentCommentId: string) =>
    `${DRAFT_PREFIX}comment-reply:${issueId}:${parentCommentId}`,
  chat: (threadId: string) => `${DRAFT_PREFIX}chat:${threadId}`,
  newIssue: `${DRAFT_PREFIX}new-issue`,
} as const;

export type NewIssueDraft = {
  title: string;
  priority: string;
  assigneeValue: string;
  projectId: string;
  customFields: { k: string; v: string }[];
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/** 读 string 草稿；无 key / 失败 → null */
export function readDraft(key: string): string | null {
  if (!key || !canUseStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 写 string 草稿 */
export function writeDraft(key: string, value: string): void {
  if (!key || !canUseStorage()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
}

/** 清除草稿 */
export function clearDraft(key: string): void {
  if (!key || !canUseStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** 读 JSON 草稿 */
export function readJsonDraft<T>(key: string): T | null {
  const raw = readDraft(key);
  if (raw == null || raw === '') return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 写 JSON 草稿 */
export function writeJsonDraft(key: string, value: unknown): void {
  try {
    writeDraft(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export type PersistentDraft = {
  value: string;
  setValue: Dispatch<SetStateAction<string>>;
  clear: () => void;
};

/**
 * 字符串草稿：mount / key 变化时恢复；setValue debounce 写盘；clear 同步清 state + storage。
 * key 为 null/'' 时不读写 storage。
 */
export function usePersistentDraft(
  key: string | null | undefined,
  debounceMs = 300,
): PersistentDraft {
  const [value, setValueState] = useState('');
  const keyRef = useRef(key ?? null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef = useRef(debounceMs);
  debounceRef.current = debounceMs;

  const flushTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // mount / key 变化：取消挂起写并恢复
  useEffect(() => {
    flushTimer();
    keyRef.current = key ?? null;
    if (!key) {
      setValueState('');
      return;
    }
    setValueState(readDraft(key) ?? '');
  }, [key, flushTimer]);

  useEffect(() => () => flushTimer(), [flushTimer]);

  const setValue = useCallback<Dispatch<SetStateAction<string>>>(
    (next) => {
      setValueState((prev) => {
        const v = typeof next === 'function' ? next(prev) : next;
        const k = keyRef.current;
        if (k) {
          flushTimer();
          timerRef.current = setTimeout(() => {
            // 仍绑定同一 key 时再落盘，避免切换 thread 后串写
            if (keyRef.current === k) writeDraft(k, v);
            timerRef.current = null;
          }, debounceRef.current);
        }
        return v;
      });
    },
    [flushTimer],
  );

  const clear = useCallback(() => {
    flushTimer();
    setValueState('');
    const k = keyRef.current;
    if (k) clearDraft(k);
  }, [flushTimer]);

  return { value, setValue, clear };
}
