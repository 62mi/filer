import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";

interface DirSizeEntry {
  path: string;
  size: number;
}

interface DirSizeStore {
  /** パス → サイズ のマッピング */
  sizes: Record<string, number>;
  /** 現在計算中のパス一覧 */
  calculatingPaths: Set<string>;
  /** リクエストのバージョン（stale結果を破棄するため） */
  _version: number;
  /** 指定パスのフォルダサイズ計算をリクエスト */
  requestSizes: (dirPaths: string[]) => void;
}

// モジュールレベルでリスナー管理
let currentUnlisten: (() => void) | null = null;

export const useDirSizeStore = create<DirSizeStore>((set, get) => ({
  sizes: {},
  calculatingPaths: new Set(),
  _version: 0,

  requestSizes: (dirPaths) => {
    const version = get()._version + 1;

    // 前回のリスナーを解除
    if (currentUnlisten) {
      currentUnlisten();
      currentUnlisten = null;
    }

    if (dirPaths.length === 0) {
      set({ sizes: {}, calculatingPaths: new Set(), _version: version });
      return;
    }

    set({
      sizes: {},
      calculatingPaths: new Set(dirPaths),
      _version: version,
    });

    // イベントリスナーを設定（結果が1件ずつ届く）
    listen<DirSizeEntry>("dir-size-calculated", (event) => {
      if (get()._version !== version) return;
      const { path, size } = event.payload;
      set((s) => {
        const newCalculating = new Set(s.calculatingPaths);
        newCalculating.delete(path);
        return {
          sizes: { ...s.sizes, [path]: size },
          calculatingPaths: newCalculating,
        };
      });
    }).then((unlisten) => {
      if (get()._version !== version) {
        unlisten();
        return;
      }
      currentUnlisten = unlisten;
    });

    // 計算をトリガー（結果はイベントで届く）
    invoke("calculate_directory_sizes", { paths: dirPaths })
      .catch(() => {})
      .finally(() => {
        if (get()._version !== version) return;
        // 全計算完了後にリスナー解除
        if (currentUnlisten) {
          currentUnlisten();
          currentUnlisten = null;
        }
        set({ calculatingPaths: new Set() });
      });
  },
}));
