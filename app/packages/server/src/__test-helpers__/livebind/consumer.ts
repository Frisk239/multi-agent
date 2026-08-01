import { db } from './state.js';
// 消费方与生产方同构：import { db } 后每次调用时读当前绑定
export function readTag(): string {
  return db.tag;
}
