import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import { useExplorerStore } from "./panelStore";

interface DirSizeEntry {
  path: string;
  size: number;
}

interface DirSizeStore {
  /** パス → サイズ のマッピング */
  sizes: Record<string, number>;
  /** サイズ計算をリクエスト済みのパス一覧（sizes に未登録なら計算中と判定） */
  requestedPaths: Set<string>;
  /** リクエストのバージョン（stale結果を破棄するため） */
  _version: number;
  /** 指定パスのフォルダサイズ計算をリクエスト */
  requestSizes: (dirPaths: string[]) => void;
}

// モジュールレベルでリスナー管理
let currentUnlisten: (() => void) | null = null;

export const useDirSizeStore = create<DirSizeStore>((set, get) => ({
  sizes: {},
  requestedPaths: new Set(),
  _version: 0,

  requestSizes: (dirPaths) => {
    const version = get()._version + 1;

    // 前回のリスナーを解除
    if (currentUnlisten) {
      currentUnlisten();
      currentUnlisten = null;
    }

    if (dirPaths.length === 0) {
      set({ sizes: {}, requestedPaths: new Set(), _version: version });
      return;
    }

    // sizes をクリア + リクエスト済みパスを記録
    // → sizes[path] が undefined && requestedPaths.has(path) なら「計算中」
    set({
      sizes: {},
      requestedPaths: new Set(dirPaths),
      _version: version,
    });

    // invoke を1フレーム遅延させ、React が「計算中」状態を描画する時間を確保
    requestAnimationFrame(() => {
      if (get()._version !== version) return;

      (async () => {
        // リスナー登録を待ってからinvoke（登録前にイベントが届くレースを防止）
        const unlisten = await listen<DirSizeEntry>("dir-size-calculated", (event) => {
          if (get()._version !== version) return;
          const { path, size } = event.payload;
          set((s) => ({
            sizes: { ...s.sizes, [path]: size },
          }));
        });

        if (get()._version !== version) {
          unlisten();
          return;
        }
        currentUnlisten = unlisten;

        try {
          await invoke("calculate_directory_sizes", { paths: dirPaths });
        } catch {
          // ignore
        }

        // イベント到着を待ってからリスナー解除 + サイズソート中なら再ソート
        setTimeout(() => {
          if (get()._version !== version) return;
          if (currentUnlisten) {
            currentUnlisten();
            currentUnlisten = null;
          }
          const tab = useExplorerStore.getState().getActiveTab();
          if (tab.sortKey === "size") {
            useExplorerStore.getState().resortEntries();
          }
        }, 100);
      })();
    });
  },
}));
