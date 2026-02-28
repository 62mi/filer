import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { type SerializedTab, useExplorerStore } from "../stores/panelStore";

const DRAG_THRESHOLD = 5;

interface DragCandidate {
  startX: number;
  startY: number;
  tabId: string;
  tabIndex: number;
}

interface TabDragResult {
  draggingTabId: string | null;
  dropIndicatorIndex: number | null;
  externalDropIndex: number | null;
  ghostRef: RefObject<HTMLDivElement | null>;
  handleTabMouseDown: (e: React.MouseEvent, tabId: string, tabIndex: number) => void;
  tabBarRef: RefObject<HTMLDivElement | null>;
}

/** タブバーのDOM要素群からマウスX座標に対するドロップ位置を計算 */
function calcDropIndex(tabBarEl: HTMLElement, clientX: number, tabCount: number): number {
  const tabElements = tabBarEl.querySelectorAll<HTMLElement>("[data-tab-index]");
  for (const el of tabElements) {
    const rect = el.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    if (clientX < midX) {
      return Number.parseInt(el.dataset.tabIndex ?? "0", 10);
    }
  }
  return tabCount;
}

export function useTabDrag(): TabDragResult {
  // State（レンダリング用）
  const [draggingTabId, _setDraggingTabId] = useState<string | null>(null);
  const [dropIndicatorIndex, _setDropIndicatorIndex] = useState<number | null>(null);
  const [externalDropIndex, _setExternalDropIndex] = useState<number | null>(null);

  // Ref（イベントハンドラ内でstale closure回避用）
  const dropIndicatorIndexRef = useRef<number | null>(null);
  const externalDropIndexRef = useRef<number | null>(null);
  const candidateRef = useRef<DragCandidate | null>(null);
  const isDraggingRef = useRef(false);
  const transferStartedRef = useRef(false);
  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  // キャンセル時のタブ復元用
  const removedTabRef = useRef<{ tabId: string; data: SerializedTab } | null>(null);

  const setDraggingTabId = useCallback((v: string | null) => {
    _setDraggingTabId(v);
  }, []);

  const setDropIndicatorIndex = useCallback((v: number | null) => {
    dropIndicatorIndexRef.current = v;
    _setDropIndicatorIndex(v);
  }, []);

  const setExternalDropIndex = useCallback((v: number | null) => {
    externalDropIndexRef.current = v;
    _setExternalDropIndex(v);
  }, []);

  const handleTabMouseDown = useCallback((e: React.MouseEvent, tabId: string, tabIndex: number) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;

    candidateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      tabId,
      tabIndex,
    };
    transferStartedRef.current = false;
  }, []);

  // ドラッグ中のmousemove / mouseup / keydownハンドラ
  useEffect(() => {
    const reset = () => {
      candidateRef.current = null;
      isDraggingRef.current = false;
      transferStartedRef.current = false;
      document.body.style.cursor = "";
      setDraggingTabId(null);
      setDropIndicatorIndex(null);
    };

    /** ウィンドウ外にドラッグ → Rust側にマウス追跡を委譲 */
    const startTransfer = async (candidate: DragCandidate) => {
      if (transferStartedRef.current) return;
      transferStartedRef.current = true;

      const store = useExplorerStore.getState();
      const tab = store.tabs.find((t) => t.id === candidate.tabId);
      if (!tab) {
        transferStartedRef.current = false;
        return;
      }

      const tabData: SerializedTab = {
        path: tab.path,
        history: tab.history,
        historyIndex: tab.historyIndex,
        sortKey: tab.sortKey,
        sortOrder: tab.sortOrder,
        viewMode: tab.viewMode,
      };

      try {
        const windowLabel = await invoke<string>("get_window_label");
        await invoke("start_tab_transfer", {
          sourceWindow: windowLabel,
          tabId: candidate.tabId,
          tabData,
        });
      } catch {
        transferStartedRef.current = false;
        return;
      }

      // ソース側でタブを直接削除（Rustイベントに頼らない確実な方式）
      const currentStore = useExplorerStore.getState();
      if (currentStore.tabs.length > 1) {
        const removed = currentStore.removeTabForTransfer(candidate.tabId);
        if (removed) {
          removedTabRef.current = { tabId: candidate.tabId, data: removed };
        }
      } else {
        // 最後のタブ → ウィンドウを破棄
        getCurrentWindow()
          .destroy()
          .catch(() => {});
      }

      reset();
    };

    const onMouseMove = (e: MouseEvent) => {
      const candidate = candidateRef.current;
      if (!candidate || transferStartedRef.current) return;

      if (!isDraggingRef.current) {
        const dx = Math.abs(e.clientX - candidate.startX);
        const dy = Math.abs(e.clientY - candidate.startY);
        if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
        isDraggingRef.current = true;
        document.body.style.cursor = "grabbing";
        setDraggingTabId(candidate.tabId);
      }

      // ゴースト要素の位置をDOM直接更新
      if (ghostRef.current) {
        ghostRef.current.style.left = `${e.clientX + 12}px`;
        ghostRef.current.style.top = `${e.clientY + 8}px`;
      }

      // マウスがウィンドウ外に出たか判定
      if (
        e.clientX < 0 ||
        e.clientY < 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      ) {
        startTransfer(candidate);
        return;
      }

      // ウィンドウ内: ドロップ位置計算
      if (tabBarRef.current) {
        const tabCount = useExplorerStore.getState().tabs.length;
        const idx = calcDropIndex(tabBarRef.current, e.clientX, tabCount);
        setDropIndicatorIndex(idx);
      }
    };

    const onMouseUp = () => {
      const candidate = candidateRef.current;
      if (!candidate) return;

      if (isDraggingRef.current && !transferStartedRef.current) {
        const store = useExplorerStore.getState();
        const fromIndex = store.tabs.findIndex((t) => t.id === candidate.tabId);
        const di = dropIndicatorIndexRef.current;
        if (di !== null && fromIndex >= 0) {
          const toIndex = di > fromIndex ? di - 1 : di;
          store.moveTab(fromIndex, toIndex);
        }
      }

      reset();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (isDraggingRef.current || transferStartedRef.current)) {
        invoke("cancel_tab_transfer").catch(() => {});
        reset();
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [setDraggingTabId, setDropIndicatorIndex]);

  // マウント時: 新規ウィンドウ向けの保留タブを確認
  // タブドラッグでウィンドウ外にドロップした際、Rust側が新ウィンドウを作成しタブデータを保留する
  useEffect(() => {
    invoke<SerializedTab | null>("check_pending_tab").then((tabData) => {
      if (tabData) {
        const defaultTabId = useExplorerStore.getState().tabs[0]?.id;
        useExplorerStore.getState().insertTabFromData(tabData);
        // insertTabFromData後の最新stateを再取得してからcloseTab
        if (defaultTabId && useExplorerStore.getState().tabs.length > 1) {
          useExplorerStore.getState().closeTab(defaultTabId);
        }
      }
    });
  }, []);

  // 外部ウィンドウからのタブドラッグイベントリスナー
  // ウィンドウ固有イベントはgetCurrentWindow().listen()で自ウィンドウ宛のみ受信
  // （listen()はAnyターゲットで全ウィンドウのイベントを拾ってしまうため）
  useEffect(() => {
    const win = getCurrentWindow();

    // ウィンドウ固有: Rustがtarget_window.emit()で送信するイベント
    const unHover = win.listen<{ x: number; y: number }>("tab-drag-hover", (e) => {
      if (!tabBarRef.current) return;
      const tabCount = useExplorerStore.getState().tabs.length;
      const idx = calcDropIndex(tabBarRef.current, e.payload.x, tabCount);
      setExternalDropIndex(idx);
    });

    const unLeave = win.listen("tab-drag-leave", () => {
      setExternalDropIndex(null);
    });

    const unDrop = win.listen<{ tab_data: SerializedTab }>("tab-drag-drop", (e) => {
      const store = useExplorerStore.getState();
      const idx = externalDropIndexRef.current;
      store.insertTabFromData(e.payload.tab_data, idx ?? undefined);
      setExternalDropIndex(null);
    });

    // グローバル: Rustがapp.emit()で送信するイベント
    const unCancel = listen("tab-drag-cancel", () => {
      setExternalDropIndex(null);
      // キャンセル時: このウィンドウから転送されたタブがあれば復元
      if (removedTabRef.current) {
        useExplorerStore.getState().insertTabFromData(removedTabRef.current.data);
        removedTabRef.current = null;
      }
    });

    return () => {
      unHover.then((f) => f()).catch(() => {});
      unLeave.then((f) => f()).catch(() => {});
      unDrop.then((f) => f()).catch(() => {});
      unCancel.then((f) => f()).catch(() => {});
    };
  }, [setExternalDropIndex]);

  return {
    draggingTabId,
    dropIndicatorIndex,
    externalDropIndex,
    ghostRef,
    handleTabMouseDown,
    tabBarRef,
  };
}
