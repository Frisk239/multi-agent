/** Chat 消息区「近底才吸底」阈值（px） */
export const NEAR_BOTTOM_PX = 100;

export type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

/** 距底部的像素距离（可为负，视为 0 处理时用 Math.max） */
export function distanceFromBottom(el: ScrollMetrics): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

/** 是否在近底阈值内（上滑超过阈值 → false，停止自动滚） */
export function isNearBottom(
  el: ScrollMetrics,
  threshold: number = NEAR_BOTTOM_PX,
): boolean {
  return distanceFromBottom(el) <= threshold;
}

/**
 * 内容更新时是否应自动滚到底。
 * stick=true 且仍近底才滚；用户上滑后 stick 由外层置 false。
 */
export function shouldAutoStick(
  stickToBottom: boolean,
  nearBottom: boolean,
): boolean {
  return stickToBottom && nearBottom;
}
