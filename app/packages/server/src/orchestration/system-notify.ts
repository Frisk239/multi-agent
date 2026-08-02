// G5-5：系统/桌面通知（纯本地，零 npm 依赖）。
// 后端 Node 进程 → spawn PowerShell WinForms NotifyIcon.ShowBalloonTip（Windows 原生弹窗）。
// 开关：inbox-prefs.json `systemNotifications`（默认 false，Settings 可开）；env `MA_SYSTEM_NOTIFY=1` 强制开。
// 失败一律静默降级（spawn 错误不影响主流程）；非 Windows 直接跳过（本产品纯本地 Windows 场景）。

import { spawn } from 'node:child_process';
import { readInboxPrefs } from './inbox-prefs.js';

export function isSystemNotifyEnabled(): boolean {
  if (
    process.env.MA_SYSTEM_NOTIFY === '1' ||
    process.env.MA_SYSTEM_NOTIFY === 'true'
  ) {
    return true;
  }
  return readInboxPrefs().systemNotifications;
}

// PowerShell 单引号转义（-Command 内字符串）：' → ''（PS 转义规则）
function psQuote(s: string): string {
  return s.replace(/'/g, "''");
}

/** 构建 PowerShell 弹窗脚本（独立函数便于单测断言形态） */
export function buildPowerShellNotifyScript(title: string, body: string): string {
  const t = psQuote(title || 'Multi-Agent Console');
  const b = psQuote(body || '');
  return [
    'Add-Type -AssemblyName System.Windows.Forms',
    `$n = New-Object System.Windows.Forms.NotifyIcon`,
    `$n.Icon = [System.Drawing.SystemIcons]::Information`,
    `$n.Visible = $true`,
    `$n.BalloonTipTitle = '${t}'`,
    `$n.BalloonTipText = '${b}'`,
    `$n.ShowBalloonTip(5000)`,
    `Start-Sleep -Seconds 6`,
    `$n.Dispose()`,
  ].join('; ');
}

// 防抖：同 title 5s 内不重复弹（run 终态 + inbox 项可能几乎同时触发双弹）；
// 全局 2s 节流兜底（失败风暴时防刷屏）。
const lastByTitle = new Map<string, number>();
let lastAny = 0;

export function showSystemNotification(opts: {
  title: string;
  body?: string | null;
}): void {
  if (!isSystemNotifyEnabled()) return;
  if (process.platform !== 'win32') return; // 仅 Windows 原生弹窗（其他平台静默）
  const now = Date.now();
  const sinceTitle = lastByTitle.get(opts.title) ?? 0;
  if (now - sinceTitle < 5_000) return;
  if (now - lastAny < 2_000) return;
  lastByTitle.set(opts.title, now);
  lastAny = now;

  const script = buildPowerShellNotifyScript(opts.title, opts.body ?? '');
  try {
    // detached 不阻塞主流程；stdio ignore（不污染 server 日志）
    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    child.on('error', () => {
      /* 静默降级：PowerShell 不可用/被禁时不影响 run 主流程 */
    });
  } catch {
    /* 静默降级 */
  }
}
