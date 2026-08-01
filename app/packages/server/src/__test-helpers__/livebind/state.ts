// live-binding 验证用最小模块：export let + swap 重赋值
export let db: { tag: string } = { tag: 'old' };
export function swapDb(next: { tag: string }): void {
  db = next;
}
