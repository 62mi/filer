const MENU_MARGIN = 4;

/**
 * メニュー位置をビューポート内にクランプする
 */
export function clampMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let clampedX = x;
  let clampedY = y;

  // 右端
  if (clampedX + menuWidth > vw - MENU_MARGIN) {
    clampedX = vw - menuWidth - MENU_MARGIN;
  }
  // 左端
  if (clampedX < MENU_MARGIN) {
    clampedX = MENU_MARGIN;
  }
  // 下端
  if (clampedY + menuHeight > vh - MENU_MARGIN) {
    clampedY = vh - menuHeight - MENU_MARGIN;
  }
  // 上端
  if (clampedY < MENU_MARGIN) {
    clampedY = MENU_MARGIN;
  }

  return { x: clampedX, y: clampedY };
}
