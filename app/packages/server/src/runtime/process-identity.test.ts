import { describe, expect, it } from 'vitest';
import { captureProcessIdentity, matchesProcessIdentity } from './process-identity.js';

describe('process identity', () => {
  it('uses Linux boot id + start ticks, not PID alone', () => {
    const stat = (startTicks: string, comm = 'agent with ) paren', pgrp = '42') =>
      `42 (${comm}) ${[
        'R',
        '1', // field 4 ppid
        pgrp, // field 5 pgrp
        ...Array.from({ length: 16 }, (_, i) => String(i + 3)),
        startTicks, // field 22
        'tail',
      ].join(' ')}`;
    const readText = (path: string) => {
      if (path.endsWith('/stat')) {
        // field 3=R, fields[19] after the closing comm parenthesis = field 22.
        return stat('99999');
      }
      return 'boot-a\n';
    };
    const first = captureProcessIdentity(42, { platform: 'linux', readText });
    expect(first).toMatchObject({ pid: 42, platform: 'linux', canKillTree: true });
    expect(first?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(matchesProcessIdentity(42, first?.fingerprint, { platform: 'linux', readText })).toBe(true);

    const reusedPid = (path: string) =>
      path.endsWith('/stat')
        ? stat('100000', 'agent')
        : 'boot-a\n';
    expect(matchesProcessIdentity(42, first?.fingerprint, { platform: 'linux', readText: reusedPid })).toBe(false);
    expect(captureProcessIdentity(42, {
      platform: 'linux',
      readText: (path) => (path.endsWith('/stat') ? stat('99999', 'agent', '9') : 'boot-a'),
    })?.canKillTree).toBe(false);
  });

  it('uses Win32 creation time and treats a changed creation time as PID reuse', () => {
    const first = captureProcessIdentity(4242, {
      platform: 'win32',
      run: () => '20260817121500.123456+480\n',
    });
    expect(matchesProcessIdentity(4242, first?.fingerprint, {
      platform: 'win32',
      run: () => '20260817121500.123456+480\n',
    })).toBe(true);
    expect(matchesProcessIdentity(4242, first?.fingerprint, {
      platform: 'win32',
      run: () => '20260817121600.000000+480\n',
    })).toBe(false);
  });

  it('fails closed when identity evidence is unavailable or unsupported', () => {
    expect(captureProcessIdentity(0)).toBeNull();
    expect(captureProcessIdentity(99, { platform: 'darwin' })).toBeNull();
    expect(matchesProcessIdentity(99, 'not-a-real-fingerprint', {
      platform: 'linux',
      readText: () => { throw new Error('gone'); },
    })).toBe(false);
  });
});
