// S08 CLI Envelope helpers（spec §5.3–5.4，WeKnora 裁剪版）
// emitOk / emitErr 均为 never：写完 JSON 后 process.exit

export function emitOk(data?: unknown, meta?: Record<string, unknown>): never {
  const body = { ok: true as const, status: 'success' as const, data, meta };
  process.stdout.write(JSON.stringify(body) + '\n');
  process.exit(0);
}

export function emitErr(
  type: string,
  message: string,
  exitCode: number,
): never {
  const body = {
    ok: false as const,
    error: { type, message, exit_code: exitCode },
  };
  process.stderr.write(JSON.stringify(body) + '\n');
  process.exit(exitCode);
}
