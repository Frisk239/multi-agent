// S06 slug 生成（spec §3.5）
// 文件名 = `<identifier>-<slug>.md`。slug 从标题生成，ASCII 安全但保留中文。
// 规则：取标题 → 空格转连字符 → 去除文件系统危险字符（/\:*?"<>|）→ 转小写 ASCII 部分 → 截断
export function generateSlug(identifier: string, title: string): string {
  const slug = title
    .trim()
    .replace(/\s+/g, '-')           // 空格 → 连字符
    .replace(/[/\\:*?"<>|]/g, '')   // 去文件系统危险字符
    .replace(/[\u0000-\u001f]/g, '') // 去控制字符
    .slice(0, 60);                   // 截断防文件名过长
  return `${identifier}-${slug}`;
}
