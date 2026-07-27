import { describe, it, expect } from 'vitest';
import { DEFAULT_LISTEN_HOST, resolveListenHost } from './bind.js';

describe('resolveListenHost', () => {
  it('defaults to 127.0.0.1', () => {
    expect(resolveListenHost({})).toBe(DEFAULT_LISTEN_HOST);
    expect(resolveListenHost({ MA_BIND: '', HOST: '' })).toBe('127.0.0.1');
  });

  it('prefers MA_BIND over HOST', () => {
    expect(resolveListenHost({ MA_BIND: '0.0.0.0', HOST: '1.2.3.4' })).toBe('0.0.0.0');
  });

  it('falls back to HOST when MA_BIND empty', () => {
    expect(resolveListenHost({ HOST: '0.0.0.0' })).toBe('0.0.0.0');
    expect(resolveListenHost({ MA_BIND: '   ', HOST: '192.168.1.5' })).toBe('192.168.1.5');
  });

  it('trims whitespace', () => {
    expect(resolveListenHost({ MA_BIND: '  0.0.0.0  ' })).toBe('0.0.0.0');
  });
});
