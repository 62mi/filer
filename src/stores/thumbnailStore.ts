import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

// キー: "path\0size" で複数サイズを共存キャッシュ
function cacheKey(path: string, size: number) {
  return `${path}\0${size}`;
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);

interface ThumbnailStore {
  thumbnails: Record<string, string>; // cacheKey → dataURL
  pending: Set<string>; // cacheKey

  fetchThumbnails: (paths: string[], size: number) => Promise<void>;
  prefetchInBackground: (paths: string[], size: number) => void;
  cancelPrefetch: () => void;
  getThumbnail: (path: string, size: number) => string | undefined;
  hasThumbnail: (path: string, size: number) => boolean;
  isPending: (path: string, size: number) => boolean;
  clearThumbnails: () => void;
}

// プリフェッチ中止用
let prefetchAbort: AbortController | null = null;

export const useThumbnailStore = create<ThumbnailStore>((set, get) => ({
  thumbnails: {},
  pending: new Set(),

  clearThumbnails: () => {
    set({ thumbnails: {}, pending: new Set() });
  },

  getThumbnail: (path, size) => {
    return get().thumbnails[cacheKey(path, size)];
  },

  hasThumbnail: (path, size) => {
    return !!get().thumbnails[cacheKey(path, size)];
  },

  isPending: (path, size) => {
    return get().pending.has(cacheKey(path, size));
  },

  fetchThumbnails: async (paths: string[], size: number) => {
    const { thumbnails, pending } = get();
    const needed = paths.filter((p) => {
      const k = cacheKey(p, size);
      return !thumbnails[k] && !pending.has(k);
    });
    if (needed.length === 0) return;

    const keys = needed.map((p) => cacheKey(p, size));
    set((s) => {
      const next = new Set(s.pending);
      keys.forEach((k) => next.add(k));
      return { pending: next };
    });

    try {
      const result = await invoke<Record<string, string>>("get_thumbnails", {
        paths: needed,
        size,
      });
      set((s) => {
        const next = new Set(s.pending);
        keys.forEach((k) => next.delete(k));
        const merged = { ...s.thumbnails };
        for (const [path, data] of Object.entries(result)) {
          merged[cacheKey(path, size)] = data;
        }
        return { thumbnails: merged, pending: next };
      });
    } catch (_err) {
      set((s) => {
        const next = new Set(s.pending);
        keys.forEach((k) => next.delete(k));
        return { pending: next };
      });
    }
  },

  cancelPrefetch: () => {
    if (prefetchAbort) {
      prefetchAbort.abort();
      prefetchAbort = null;
    }
  },

  // バックグラウンドでチャンク分割してプリフェッチ
  prefetchInBackground: (paths: string[], size: number) => {
    // 前回のプリフェッチを中止
    if (prefetchAbort) {
      prefetchAbort.abort();
    }
    const controller = new AbortController();
    prefetchAbort = controller;

    const { thumbnails, pending } = get();
    const needed = paths.filter((p) => {
      const k = cacheKey(p, size);
      return !thumbnails[k] && !pending.has(k);
    });
    if (needed.length === 0) return;

    const CHUNK_SIZE = 8;
    const INITIAL_DELAY = 600; // 画面内のIO読み込みを優先
    const CHUNK_INTERVAL = 150; // チャンク間の休憩

    const chunks: string[][] = [];
    for (let i = 0; i < needed.length; i += CHUNK_SIZE) {
      chunks.push(needed.slice(i, i + CHUNK_SIZE));
    }

    (async () => {
      // 画面内サムネイル（IntersectionObserver経由）を先に処理させる
      await new Promise((r) => setTimeout(r, INITIAL_DELAY));
      if (controller.signal.aborted) return;

      for (const chunk of chunks) {
        if (controller.signal.aborted) return;

        // 既にキャッシュ済み or pending のものはスキップ
        const current = get();
        const todo = chunk.filter((p) => {
          const k = cacheKey(p, size);
          return !current.thumbnails[k] && !current.pending.has(k);
        });
        if (todo.length === 0) continue;

        const keys = todo.map((p) => cacheKey(p, size));
        set((s) => {
          const next = new Set(s.pending);
          keys.forEach((k) => next.add(k));
          return { pending: next };
        });

        try {
          const result = await invoke<Record<string, string>>("get_thumbnails", {
            paths: todo,
            size,
          });
          if (controller.signal.aborted) return;
          set((s) => {
            const next = new Set(s.pending);
            keys.forEach((k) => next.delete(k));
            const merged = { ...s.thumbnails };
            for (const [path, data] of Object.entries(result)) {
              merged[cacheKey(path, size)] = data;
            }
            return { thumbnails: merged, pending: next };
          });
        } catch {
          if (controller.signal.aborted) return;
          set((s) => {
            const next = new Set(s.pending);
            keys.forEach((k) => next.delete(k));
            return { pending: next };
          });
        }

        // 次のチャンクまで少し待つ（UIスレッドに余裕を持たせる）
        if (!controller.signal.aborted) {
          await new Promise((r) => setTimeout(r, CHUNK_INTERVAL));
        }
      }
    })();
  },
}));

/** エントリ配列から画像パスだけ抽出するヘルパー */
export function extractImagePaths(
  entries: { is_dir: boolean; extension: string; path: string }[],
): string[] {
  return entries.filter((e) => !e.is_dir && IMAGE_EXTS.has(e.extension)).map((e) => e.path);
}
