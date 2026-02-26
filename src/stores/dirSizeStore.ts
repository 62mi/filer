import { invoke } from "@tauri-apps/api/core";
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

export const useDirSizeStore = create<DirSizeStore>((set, get) => ({
  sizes: {},
  calculatingPaths: new Set(),
  _version: 0,

  requestSizes: (dirPaths) => {
    const version = get()._version + 1;

    if (dirPaths.length === 0) {
      set({ sizes: {}, calculatingPaths: new Set(), _version: version });
      return;
    }

    set({
      sizes: {},
      calculatingPaths: new Set(dirPaths),
      _version: version,
    });

    invoke<DirSizeEntry[]>("calculate_directory_sizes", { paths: dirPaths })
      .then((results) => {
        if (get()._version !== version) return;
        const newSizes: Record<string, number> = {};
        for (const r of results) {
          newSizes[r.path] = r.size;
        }
        set({ sizes: newSizes, calculatingPaths: new Set() });
      })
      .catch(() => {
        if (get()._version !== version) return;
        set({ calculatingPaths: new Set() });
      });
  },
}));
