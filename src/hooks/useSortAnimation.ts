import { useCallback, useRef } from "react";

/** ファイル要素の位置情報 */
interface ElementRect {
  top: number;
  left: number;
}

/** アニメーション時間 (ms) */
const ANIMATION_DURATION = 250;

/** この件数を超えるとアニメーション無効化 */
const MAX_ANIMATED_ITEMS = 1000;

/**
 * ソート切替時のFLIPアニメーションフック。
 *
 * 使い方:
 * 1. capturePositions(containerEl) でソート前の各ファイル要素の位置を記録
 * 2. setSort() を呼ぶ（DOMが更新される）
 * 3. React再描画後、animateFlip(containerEl) で旧位置→新位置のアニメーション再生
 *
 * Panel.tsx では handleSort でこの2つを順に呼ぶ。
 */
export function useSortAnimation() {
  /** ソート前の各要素の位置マップ (data-file-path → rect) */
  const positionsRef = useRef<Map<string, ElementRect>>(new Map());

  /**
   * First: ソート変更前に各ファイル要素の位置を記録する。
   * コンテナ内の [data-file-path] 要素をすべてスキャンする。
   */
  const capturePositions = useCallback((container: HTMLElement | null) => {
    positionsRef.current.clear();
    if (!container) return;

    const elements = container.querySelectorAll<HTMLElement>("[data-file-path]");
    if (elements.length > MAX_ANIMATED_ITEMS) return; // 大量ファイルでは無効化

    for (const el of elements) {
      const path = el.dataset.filePath;
      if (!path) continue;
      const rect = el.getBoundingClientRect();
      positionsRef.current.set(path, { top: rect.top, left: rect.left });
    }
  }, []);

  /**
   * Last → Invert → Play: DOMが更新された後に呼ぶ。
   * 新位置と旧位置の差分をtransformで逆転させ、アニメーションで元に戻す。
   */
  const animateFlip = useCallback((container: HTMLElement | null) => {
    const prevPositions = positionsRef.current;
    if (!container || prevPositions.size === 0) return;

    const elements = container.querySelectorAll<HTMLElement>("[data-file-path]");
    const animations: { el: HTMLElement; dx: number; dy: number }[] = [];

    for (const el of elements) {
      const path = el.dataset.filePath;
      if (!path) continue;

      const prevRect = prevPositions.get(path);
      if (!prevRect) continue; // 新しく追加された要素はスキップ

      // Last: 新しい位置
      const newRect = el.getBoundingClientRect();

      // Invert: 旧位置との差分を計算
      const dx = prevRect.left - newRect.left;
      const dy = prevRect.top - newRect.top;

      // 移動していない要素はスキップ
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      animations.push({ el, dx, dy });
    }

    if (animations.length === 0) {
      prevPositions.clear();
      return;
    }

    // Invert: 旧位置にtransformで戻す
    for (const { el, dx, dy } of animations) {
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.style.willChange = "transform";
      el.style.transition = "none";
    }

    // Play: 次のフレームでtransitionを有効化して元の位置に戻す
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const { el } of animations) {
          el.style.transition = `transform ${ANIMATION_DURATION}ms ease-out`;
          el.style.transform = "";
        }

        // アニメーション完了後にクリーンアップ
        const cleanup = () => {
          for (const { el } of animations) {
            el.style.willChange = "";
            el.style.transition = "";
            el.style.transform = "";
          }
        };

        // 最初の要素のtransitionendで全クリーンアップ（フォールバック: setTimeout）
        const firstEl = animations[0].el;
        const onEnd = () => {
          firstEl.removeEventListener("transitionend", onEnd);
          cleanup();
        };
        firstEl.addEventListener("transitionend", onEnd);

        // フォールバック: transitionendが発火しなかった場合
        setTimeout(cleanup, ANIMATION_DURATION + 50);
      });
    });

    prevPositions.clear();
  }, []);

  return { capturePositions, animateFlip };
}
