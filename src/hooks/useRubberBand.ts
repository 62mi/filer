import { useCallback, useEffect, useRef, useState } from "react";
import { useExplorerStore } from "../stores/panelStore";

/** ラバーバンド矩形の表示用座標（ビューポート相対） */
export interface RubberBandRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** ラバーバンド開始時の状態 */
interface DragState {
  /** ドラッグ開始地点（ビューポート座標） */
  startX: number;
  startY: number;
  /** ドラッグ開始時のコンテナ scrollTop */
  scrollTop: number;
  /** ドラッグ開始時のコンテナ scrollLeft */
  scrollLeft: number;
  /** Ctrl が押されていた場合の既存選択 */
  initialSelection: Set<number>;
}

/** ドラッグ開始の閾値 (px) — ファイルドラッグと同じ値 */
const DRAG_THRESHOLD = 5;

/** 自動スクロール速度 (px/frame) */
const AUTO_SCROLL_SPEED = 8;
/** 自動スクロールが発動するコンテナ端からの距離 (px) */
const AUTO_SCROLL_MARGIN = 40;

/**
 * パネル背景からのマウスドラッグでラバーバンド（範囲選択矩形）を表示し、
 * 矩形と交差するファイルを選択するカスタムフック。
 *
 * - ファイル上からのドラッグは既存のネイティブD&Dにフォールバック
 * - Ctrl+ドラッグで既存選択に追加
 */
export function useRubberBand(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [rect, setRect] = useState<RubberBandRect | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const activeRef = useRef(false);
  /** ラバーバンド操作が直前に完了したかを示すフラグ（click抑制用） */
  const justFinishedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  /** コンテナ内の data-file-index 属性付き要素を収集し、交差判定 */
  const updateSelection = useCallback(
    (currentX: number, currentY: number) => {
      const container = containerRef.current;
      if (!container || !dragStateRef.current) return;

      const state = dragStateRef.current;

      // 矩形のコンテナ相対座標を計算（スクロール分を加算）
      const containerRect = container.getBoundingClientRect();

      // ビューポート座標でのドラッグ開始位置をコンテナスクロール座標に変換
      const startContainerX = state.startX - containerRect.left + state.scrollLeft;
      const startContainerY = state.startY - containerRect.top + state.scrollTop;

      // 現在のマウス位置をコンテナスクロール座標に変換
      const currentContainerX = currentX - containerRect.left + container.scrollLeft;
      const currentContainerY = currentY - containerRect.top + container.scrollTop;

      // 選択矩形（コンテナスクロール座標系）
      const selLeft = Math.min(startContainerX, currentContainerX);
      const selTop = Math.min(startContainerY, currentContainerY);
      const selRight = Math.max(startContainerX, currentContainerX);
      const selBottom = Math.max(startContainerY, currentContainerY);

      // ビューポート座標でのラバーバンド矩形を計算（CSSレンダリング用）
      // コンテナの表示領域でクリップ
      const viewLeft = Math.max(
        selLeft - container.scrollLeft + containerRect.left,
        containerRect.left,
      );
      const viewTop = Math.max(selTop - container.scrollTop + containerRect.top, containerRect.top);
      const viewRight = Math.min(
        selRight - container.scrollLeft + containerRect.left,
        containerRect.right,
      );
      const viewBottom = Math.min(
        selBottom - container.scrollTop + containerRect.top,
        containerRect.bottom,
      );

      setRect({
        left: viewLeft,
        top: viewTop,
        width: Math.max(0, viewRight - viewLeft),
        height: Math.max(0, viewBottom - viewTop),
      });

      // ファイル要素との交差判定
      const fileElements = container.querySelectorAll<HTMLElement>("[data-file-index]");
      const newSelection = new Set<number>(state.initialSelection);

      for (const el of fileElements) {
        const indexStr = el.getAttribute("data-file-index");
        if (indexStr === null) continue;
        const index = Number.parseInt(indexStr, 10);

        // 要素のコンテナ相対位置を計算
        const elRect = el.getBoundingClientRect();
        const elLeft = elRect.left - containerRect.left + container.scrollLeft;
        const elTop = elRect.top - containerRect.top + container.scrollTop;
        const elRight = elLeft + elRect.width;
        const elBottom = elTop + elRect.height;

        // 矩形交差判定
        const intersects =
          selLeft < elRight && selRight > elLeft && selTop < elBottom && selBottom > elTop;

        if (intersects) {
          newSelection.add(index);
        }
      }

      // ストアに反映
      const store = useExplorerStore.getState();
      const activeTab = store.getActiveTab();
      // 変更があった場合のみ更新（パフォーマンス）
      if (!setsEqual(activeTab.selectedIndices, newSelection)) {
        useExplorerStore.setState((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === s.activeTabId ? { ...t, selectedIndices: newSelection } : t,
          ),
        }));
      }
    },
    [containerRef],
  );

  /** mousedown ハンドラ — Panel の listRef に設定 */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // 左クリックのみ
      if (e.button !== 0) return;

      // ファイル要素上からのドラッグはスキップ（既存のファイルドラッグに委譲）
      const target = e.target as HTMLElement;
      if (target.closest?.("[data-file-path]")) return;

      // テキスト入力中はスキップ
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

      const container = containerRef.current;
      if (!container) return;

      // Ctrl が押されていれば既存選択を保持
      const initialSelection = e.ctrlKey
        ? new Set(useExplorerStore.getState().getActiveTab().selectedIndices)
        : new Set<number>();

      dragStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        scrollTop: container.scrollTop,
        scrollLeft: container.scrollLeft,
        initialSelection,
      };
    },
    [containerRef],
  );

  // グローバル mousemove / mouseup リスナー
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state) return;

      // まだ閾値未達
      if (!activeRef.current) {
        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
          return;
        }
        // 閾値超過 → ラバーバンドモード開始
        activeRef.current = true;
        // ドラッグ中のテキスト選択を防止
        document.body.style.userSelect = "none";
      }

      updateSelection(e.clientX, e.clientY);
      autoScroll(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      if (activeRef.current) {
        // ラバーバンド終了
        activeRef.current = false;
        // click イベントが発火する前にフラグを立て、次のマイクロタスクでリセット
        justFinishedRef.current = true;
        requestAnimationFrame(() => {
          justFinishedRef.current = false;
        });
        setRect(null);
        document.body.style.userSelect = "";
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      }
      dragStateRef.current = null;
    };

    /** コンテナ端に近づいたら自動スクロール */
    const autoScroll = (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      const containerRect = container.getBoundingClientRect();
      let scrollDeltaY = 0;
      let scrollDeltaX = 0;

      // 縦方向
      if (clientY < containerRect.top + AUTO_SCROLL_MARGIN) {
        scrollDeltaY = -AUTO_SCROLL_SPEED;
      } else if (clientY > containerRect.bottom - AUTO_SCROLL_MARGIN) {
        scrollDeltaY = AUTO_SCROLL_SPEED;
      }

      // 横方向
      if (clientX < containerRect.left + AUTO_SCROLL_MARGIN) {
        scrollDeltaX = -AUTO_SCROLL_SPEED;
      } else if (clientX > containerRect.right - AUTO_SCROLL_MARGIN) {
        scrollDeltaX = AUTO_SCROLL_SPEED;
      }

      if (scrollDeltaY === 0 && scrollDeltaX === 0) return;

      const tick = () => {
        if (!activeRef.current || !container) return;
        container.scrollTop += scrollDeltaY;
        container.scrollLeft += scrollDeltaX;
        // スクロール後に選択矩形を再計算
        updateSelection(clientX, clientY);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [containerRef, updateSelection]);

  return { rect, handleMouseDown, isActive: activeRef, justFinished: justFinishedRef };
}

/** Set の等値比較 */
function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}
