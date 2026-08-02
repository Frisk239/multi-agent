import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isSystemNotifyEnabled,
  buildPowerShellNotifyScript,
  showSystemNotification,
} from './system-notify.js';
import { readInboxPrefs, writeInboxPrefs } from './inbox-prefs.js';

// G5-5：系统通知开关 + PowerShell 脚本形态 + 弹窗防抖/静默降级。
// spawn 用 mock 验证（真实弹窗由实证环节覆盖）。

const { spawn } = await import('node:child_process');
vi.mock('node:child_process', async (importOriginal) => {
  const orig = (await importOriginal()) as typeof import('node:child_process');
  return { ...orig, spawn: vi.fn(orig.spawn) };
});

describe('G5-5 system-notify: isSystemNotifyEnabled', () => {
  const origEnv = process.env.MA_SYSTEM_NOTIFY;

  afterEach(() => {
    if (origEnv === undefined) delete process.env.MA_SYSTEM_NOTIFY;
    else process.env.MA_SYSTEM_NOTIFY = origEnv;
  });

  it('默认关（prefs systemNotifications=false）', () => {
    delete process.env.MA_SYSTEM_NOTIFY;
    writeInboxPrefs({ systemNotifications: false });
    expect(isSystemNotifyEnabled()).toBe(false);
  });

  it('prefs 开启后生效', () => {
    delete process.env.MA_SYSTEM_NOTIFY;
    writeInboxPrefs({ systemNotifications: true });
    expect(isSystemNotifyEnabled()).toBe(true);
    writeInboxPrefs({ systemNotifications: false });
  });

  it('env MA_SYSTEM_NOTIFY=1 强制开', () => {
    writeInboxPrefs({ systemNotifications: false });
    process.env.MA_SYSTEM_NOTIFY = '1';
    expect(isSystemNotifyEnabled()).toBe(true);
  });
});

describe('G5-5 system-notify: buildPowerShellNotifyScript', () => {
  it('脚本含 NotifyIcon 弹窗 + 单引号转义', () => {
    const script = buildPowerShellNotifyScript("Run 失败 · FRI-99", "It's broken");
    expect(script).toContain('$n.ShowBalloonTip(5000)');
    expect(script).toContain("BalloonTipTitle = 'Run 失败 · FRI-99'");
    // PS 单引号转义：It's → It''s
    expect(script).toContain("BalloonTipText = 'It''s broken'");
    expect(script).toContain('$n.Dispose()');
  });

  it('空 title/body 有兜底', () => {
    const script = buildPowerShellNotifyScript('', '');
    expect(script).toContain("BalloonTipTitle = 'Multi-Agent Console'");
    expect(script).toContain("BalloonTipText = ''");
  });
});

describe('G5-5 system-notify: showSystemNotification', () => {
  const mockedSpawn = vi.mocked(spawn);

  beforeEach(() => {
    mockedSpawn.mockClear();
    delete process.env.MA_SYSTEM_NOTIFY;
    writeInboxPrefs({ systemNotifications: false });
  });

  it('开关关 → 不 spawn', () => {
    showSystemNotification({ title: 'Run 完成', body: 'x' });
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it('开关开 → spawn powershell 弹窗脚本（win32）', () => {
    const isWin = process.platform === 'win32';
    writeInboxPrefs({ systemNotifications: true });
    mockedSpawn.mockReturnValue({
      unref: () => {},
      on: () => {},
    } as unknown as ReturnType<typeof spawn>);
    showSystemNotification({ title: 'Run 完成', body: 'y' });
    if (isWin) {
      expect(mockedSpawn).toHaveBeenCalledTimes(1);
      const [bin, args] = mockedSpawn.mock.calls[0] as unknown as [string, string[]];
      expect(bin).toBe('powershell');
      expect(args.join(' ')).toContain('ShowBalloonTip');
    } else {
      expect(mockedSpawn).not.toHaveBeenCalled();
    }
  });
});
