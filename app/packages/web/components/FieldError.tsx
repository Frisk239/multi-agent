'use client';

/**
 * 表单字段错误行（W3）：与输入框 aria-describedby 联动。
 * role="alert" 提供即时播报（隐式 aria-live="assertive"），
 * 与 CreateSkillDialog 内联错误行的既有语义一致。
 * message 为空时不渲染任何节点，避免残留空行。
 */
export function FieldError({
  id,
  message,
  dataTestId,
}: {
  /** 与输入框 aria-describedby 指向的 id 一致 */
  id?: string;
  message?: string | null;
  dataTestId?: string;
}) {
  if (!message) return null;
  return (
    <p
      id={id}
      className="field-error"
      role="alert"
      data-testid={dataTestId}
    >
      {message}
    </p>
  );
}
