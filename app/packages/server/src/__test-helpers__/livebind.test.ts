import { describe, expect, it } from 'vitest';
import { swapDb, db } from './livebind/state.js';
import { readTag } from './livebind/consumer.js';

describe('ESM live binding (D1 方案 b 可行性)', () => {
  it('swap 后 import 方读到的绑定是新值', () => {
    expect(readTag()).toBe('old');
    swapDb({ tag: 'new' });
    expect(readTag()).toBe('new'); // live binding：消费方无需重新 import
  });

  it('模块内直接引用也跟随', () => {
    swapDb({ tag: 'second' });
    expect(db.tag).toBe('second');
  });
});
