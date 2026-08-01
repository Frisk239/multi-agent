/**
 * 前端 Zod 校验层（W3）：提交前用 @ma/shared 的 schema 校验表单数据，
 * 产出字段级错误（key = 第一个 path 段，供表单字段定位），
 * 表单据此渲染 FieldError + aria-invalid + aria-describedby。
 *
 * 用结构类型（ZodLike）而非直接 import zod：web 不声明 zod 依赖，
 * @ma/shared 里导出的任意 Zod schema 均结构兼容。
 */

/** 与 Zod schema.safeParse 兼容的最小形状 */
export interface ZodLike<T> {
  safeParse(data: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: {
          issues: Array<{ path: PropertyKey[]; message: string }>;
        };
      };
}

/** 字段级错误表：key = 字段名（嵌套 path 取第一段），value = 首条错误文案 */
export type FieldErrors = Record<string, string>;

export type ValidateResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: FieldErrors };

/** 顶层（非字段级）错误落到 `_form`，表单可渲染为表单级提示 */
export const FORM_LEVEL_ERROR_KEY = '_form';

/**
 * 用 Zod schema 校验任意输入，返回字段级错误表。
 * - ok=true   → data 为类型安全的解析结果（含 default 填充）
 * - ok=false  → errors 按字段聚合（同字段只保留第一条，Zod issue 顺序稳定：
 *               基础校验先于 superRefine，天然「先报基础错误」）
 */
export function validateWith<T>(schema: ZodLike<T>, data: unknown): ValidateResult<T> {
  const parsed = schema.safeParse(data);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : FORM_LEVEL_ERROR_KEY;
    if (!(key in errors)) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/** 取某字段错误文案（无则 null，FieldError 据此决定渲染与否） */
export function fieldError(errors: FieldErrors | null | undefined, key: string): string | null {
  return errors?.[key] ?? null;
}
