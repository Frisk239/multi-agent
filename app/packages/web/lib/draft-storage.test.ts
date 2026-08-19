import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDraft,
  draftKey,
  readDraft,
  readJsonDraft,
  writeDraft,
  writeJsonDraft,
} from './draft-storage';

describe('draftKey', () => {
  it('builds stable localStorage keys', () => {
    expect(draftKey.comment('iss-1')).toBe('ma-draft:comment:iss-1');
    expect(draftKey.commentReply('iss-1', 'comment-9')).toBe(
      'ma-draft:comment-reply:iss-1:comment-9',
    );
    expect(draftKey.chat('th-9')).toBe('ma-draft:chat:th-9');
    expect(draftKey.newIssue).toBe('ma-draft:new-issue');
  });
});

describe('draft-storage string', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('write/read/clear roundtrip', () => {
    const key = draftKey.comment('abc');
    expect(readDraft(key)).toBeNull();
    writeDraft(key, 'hello draft');
    expect(readDraft(key)).toBe('hello draft');
    clearDraft(key);
    expect(readDraft(key)).toBeNull();
  });

  it('returns null for empty key', () => {
    expect(readDraft('')).toBeNull();
    writeDraft('', 'x');
    expect(window.localStorage.length).toBe(0);
    clearDraft('');
  });

  it('swallows storage errors (no throw)', () => {
    const spyGet = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const spySet = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const spyRemove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readDraft('ma-draft:x')).toBeNull();
    expect(() => writeDraft('ma-draft:x', 'v')).not.toThrow();
    expect(() => clearDraft('ma-draft:x')).not.toThrow();
    spyGet.mockRestore();
    spySet.mockRestore();
    spyRemove.mockRestore();
  });
});

describe('draft-storage json', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('writeJson/readJson roundtrip', () => {
    const payload = {
      title: 't1',
      priority: 'high',
      assigneeValue: 'agent:a1',
      projectId: 'p1',
      customFields: [{ k: '环境', v: 'Staging' }],
    };
    writeJsonDraft(draftKey.newIssue, payload);
    expect(readJsonDraft<typeof payload>(draftKey.newIssue)).toEqual(payload);
    clearDraft(draftKey.newIssue);
    expect(readJsonDraft(draftKey.newIssue)).toBeNull();
  });

  it('returns null on invalid JSON', () => {
    writeDraft(draftKey.newIssue, '{not-json');
    expect(readJsonDraft(draftKey.newIssue)).toBeNull();
  });

  it('returns null on empty string', () => {
    writeDraft(draftKey.newIssue, '');
    expect(readJsonDraft(draftKey.newIssue)).toBeNull();
  });
});
