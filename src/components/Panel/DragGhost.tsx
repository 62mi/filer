/**
 * ドラッグ時のカスタムゴーストイメージを生成するユーティリティ。
 * dragstart イベント内で同期的にDOM要素を作成し、setDragImageに渡す。
 * 複数ファイルの場合はファン状にカードを重ねて表示する。
 */

interface DragItem {
  name: string;
  is_dir: boolean;
}

const FOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`;

const FILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`;

const CARD_STYLE = `
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: white;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.10);
  max-width: 220px;
  font-family: system-ui, -apple-system, sans-serif;
  position: absolute;
  left: 0;
  top: 0;
`;

function createCard(item: DragItem): HTMLElement {
  const card = document.createElement("div");
  card.style.cssText = CARD_STYLE;

  const iconWrapper = document.createElement("span");
  iconWrapper.innerHTML = item.is_dir ? FOLDER_SVG : FILE_SVG;
  iconWrapper.style.cssText = "display: flex; flex-shrink: 0;";
  card.appendChild(iconWrapper);

  const nameEl = document.createElement("span");
  nameEl.textContent = item.name;
  nameEl.style.cssText = `
    font-size: 12px;
    color: #1a1a1a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  `;
  card.appendChild(nameEl);

  return card;
}

export function createDragGhost(items: DragItem[]): HTMLElement {
  const count = items.length;

  const ghost = document.createElement("div");
  ghost.id = "drag-ghost-el";
  ghost.style.cssText = `
    position: fixed;
    top: -300px;
    left: -300px;
    z-index: -1;
    pointer-events: none;
  `;

  // ファン状に重ねるコンテナ
  const container = document.createElement("div");
  container.style.cssText = `
    position: relative;
    width: 240px;
    height: 60px;
  `;

  if (count === 1) {
    // 単一ファイル: そのままカード表示
    const card = createCard(items[0]);
    card.style.position = "relative";
    container.appendChild(card);
  } else {
    // 複数ファイル: 最大3枚をファン状に重ねる
    const showCount = Math.min(count, 3);

    for (let i = showCount - 1; i >= 0; i--) {
      const card = createCard(items[i] || items[0]);
      // ファン状のオフセット: 回転と位置をずらす
      const rotation = (i - 0) * 3; // 0°, 3°, 6°
      const offsetX = i * 4;
      const offsetY = i * 2;
      card.style.transform = `translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg)`;
      card.style.transformOrigin = "bottom left";
      // 後ろのカードほど少し透明に
      if (i > 0) {
        card.style.opacity = String(0.7);
      }
      container.appendChild(card);
    }

    // +N バッジ（2個以上の場合）
    const badge = document.createElement("span");
    badge.textContent = `+${count}`;
    badge.style.cssText = `
      position: absolute;
      top: -6px;
      right: 10px;
      font-size: 11px;
      background: #0078d4;
      color: white;
      border-radius: 9999px;
      padding: 1px 7px;
      min-width: 20px;
      text-align: center;
      font-weight: 600;
      line-height: 18px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.15);
      z-index: 10;
    `;
    container.appendChild(badge);
  }

  ghost.appendChild(container);
  document.body.appendChild(ghost);

  return container;
}

export function removeDragGhost() {
  const el = document.getElementById("drag-ghost-el");
  if (el) el.remove();
}
