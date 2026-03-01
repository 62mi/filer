import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { create } from "zustand";
import { GOOGLE_DOCS_EXTENSIONS } from "../utils/previewConstants";

// キー: "path\0size" で複数サイズを共存キャッシュ
function cacheKey(path: string, size: number) {
  return `${path}\0${size}`;
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mkv", "avi", "mov", "wmv", "flv", "m4v"]);
const PDF_EXTS = new Set(["pdf"]);
const PSD_EXTS = new Set(["psd", "psb"]);

// FFmpeg利用可否キャッシュ
let ffmpegAvailable: boolean | null = null;
async function checkFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    ffmpegAvailable = await invoke<boolean>("check_ffmpeg_available");
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

/** FFmpegキャッシュをリセット（インストール後の再検出用） */
export function resetFfmpegCache() {
  ffmpegAvailable = null;
}

interface ThumbnailStore {
  thumbnails: Record<string, string>; // cacheKey → dataURL or HTTP URL
  pending: Set<string>; // cacheKey

  fetchThumbnails: (paths: string[], size: number) => Promise<void>;
  fetchVideoThumbnail: (path: string, size: number) => Promise<void>;
  fetchGoogleDocsThumbnails: (paths: string[], size: number) => Promise<void>;
  prefetchInBackground: (paths: string[], size: number) => void;
  prefetchVideosInBackground: (paths: string[], size: number) => void;
  fetchPdfThumbnail: (path: string, size: number) => Promise<void>;
  fetchPsdThumbnail: (path: string, size: number) => Promise<void>;
  prefetchPdfInBackground: (paths: string[], size: number) => void;
  prefetchPsdInBackground: (paths: string[], size: number) => void;
  prefetchGoogleDocsInBackground: (paths: string[], size: number) => void;
  cancelPrefetch: () => void;
  cancelVideoPrefetch: () => void;
  cancelPdfPrefetch: () => void;
  cancelPsdPrefetch: () => void;
  cancelGoogleDocsPrefetch: () => void;
  getThumbnail: (path: string, size: number) => string | undefined;
  hasThumbnail: (path: string, size: number) => boolean;
  isPending: (path: string, size: number) => boolean;
  removeThumbnail: (path: string, size: number) => void;
  clearThumbnails: () => void;
}

// プリフェッチ中止用
let prefetchAbort: AbortController | null = null;
let videoPrefetchAbort: AbortController | null = null;
let pdfPrefetchAbort: AbortController | null = null;
let psdPrefetchAbort: AbortController | null = null;
let gdocsPrefetchAbort: AbortController | null = null;

// pdfjs-dist の遅延ロード
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return mod;
    });
  }
  return pdfjsPromise;
}

/** PDFの1ページ目をCanvasに描画してdataURLを返す */
async function renderPdfThumbnail(filePath: string, size: number): Promise<string> {
  const pdfjsLib = await getPdfjs();
  const url = convertFileSrc(filePath);
  const pdf = await pdfjsLib.getDocument(url).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const scale = size / Math.max(viewport.width, viewport.height);
  const scaledViewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available");

  await page.render({ canvasContext: ctx, canvas, viewport: scaledViewport }).promise;
  const dataUrl = canvas.toDataURL("image/png");
  pdf.destroy();
  return dataUrl;
}

/** PSDをag-psdでパースしてサムネイルdataURLを返す。CMYK等はFFmpegフォールバック */
async function renderPsdThumbnail(filePath: string, size: number): Promise<string> {
  // 1) ag-psdで試す（RGB対応）
  try {
    const { readPsd } = await import("ag-psd");
    const url = convertFileSrc(filePath);
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    const psd = readPsd(new Uint8Array(buffer), { skipLayerImageData: true });
    if (psd.canvas) {
      const scale = size / Math.max(psd.canvas.width, psd.canvas.height);
      const w = Math.round(psd.canvas.width * scale);
      const h = Math.round(psd.canvas.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context not available");
      ctx.drawImage(psd.canvas, 0, 0, w, h);
      return canvas.toDataURL("image/png");
    }
  } catch {
    // ag-psd失敗 → FFmpegフォールバック
  }

  // 2) FFmpegフォールバック（CMYK等）
  return invoke<string>("extract_video_thumbnail", { path: filePath, size });
}

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
      for (const k of keys) next.add(k);
      return { pending: next };
    });

    try {
      const result = await invoke<Record<string, string>>("get_thumbnails", {
        paths: needed,
        size,
      });
      set((s) => {
        const next = new Set(s.pending);
        for (const k of keys) next.delete(k);
        const merged = { ...s.thumbnails };
        for (const [path, data] of Object.entries(result)) {
          merged[cacheKey(path, size)] = data;
        }
        return { thumbnails: merged, pending: next };
      });
    } catch (_err) {
      set((s) => {
        const next = new Set(s.pending);
        for (const k of keys) next.delete(k);
        return { pending: next };
      });
    }
  },

  // 動画サムネイル取得（1ファイルずつ、FFmpeg経由）
  fetchVideoThumbnail: async (path: string, size: number) => {
    const k = cacheKey(path, size);
    const { thumbnails, pending } = get();
    if (thumbnails[k] || pending.has(k)) return;
    if (!(await checkFfmpeg())) return;

    set((s) => {
      const next = new Set(s.pending);
      next.add(k);
      return { pending: next };
    });

    try {
      const dataUrl = await invoke<string>("extract_video_thumbnail", { path, size });
      set((s) => {
        const next = new Set(s.pending);
        next.delete(k);
        return { thumbnails: { ...s.thumbnails, [k]: dataUrl }, pending: next };
      });
    } catch {
      set((s) => {
        const next = new Set(s.pending);
        next.delete(k);
        return { pending: next };
      });
    }
  },

  // PDFサムネイル取得（1ファイルずつ、pdfjs経由）
  fetchPdfThumbnail: async (path: string, size: number) => {
    const k = cacheKey(path, size);
    const { thumbnails, pending } = get();
    if (thumbnails[k] || pending.has(k)) return;

    set((s) => {
      const next = new Set(s.pending);
      next.add(k);
      return { pending: next };
    });

    try {
      const dataUrl = await renderPdfThumbnail(path, size);
      set((s) => {
        const next = new Set(s.pending);
        next.delete(k);
        return { thumbnails: { ...s.thumbnails, [k]: dataUrl }, pending: next };
      });
    } catch {
      set((s) => {
        const next = new Set(s.pending);
        next.delete(k);
        return { pending: next };
      });
    }
  },

  // PSDサムネイル取得（1ファイルずつ、ag-psd経由）
  fetchPsdThumbnail: async (path: string, size: number) => {
    const k = cacheKey(path, size);
    const { thumbnails, pending } = get();
    if (thumbnails[k] || pending.has(k)) return;

    set((s) => {
      const next = new Set(s.pending);
      next.add(k);
      return { pending: next };
    });

    try {
      const dataUrl = await renderPsdThumbnail(path, size);
      set((s) => {
        const next = new Set(s.pending);
        next.delete(k);
        return { thumbnails: { ...s.thumbnails, [k]: dataUrl }, pending: next };
      });
    } catch {
      set((s) => {
        const next = new Set(s.pending);
        next.delete(k);
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

  cancelVideoPrefetch: () => {
    if (videoPrefetchAbort) {
      videoPrefetchAbort.abort();
      videoPrefetchAbort = null;
    }
  },

  cancelPdfPrefetch: () => {
    if (pdfPrefetchAbort) {
      pdfPrefetchAbort.abort();
      pdfPrefetchAbort = null;
    }
  },

  cancelPsdPrefetch: () => {
    if (psdPrefetchAbort) {
      psdPrefetchAbort.abort();
      psdPrefetchAbort = null;
    }
  },

  cancelGoogleDocsPrefetch: () => {
    if (gdocsPrefetchAbort) {
      gdocsPrefetchAbort.abort();
      gdocsPrefetchAbort = null;
    }
  },

  removeThumbnail: (path, size) => {
    const k = cacheKey(path, size);
    set((s) => {
      const next = { ...s.thumbnails };
      delete next[k];
      return { thumbnails: next };
    });
  },

  // Google Docs サムネイルURL取得（バッチ）
  fetchGoogleDocsThumbnails: async (paths: string[], size: number) => {
    const { thumbnails, pending } = get();
    const needed = paths.filter((p) => {
      const k = cacheKey(p, size);
      return !thumbnails[k] && !pending.has(k);
    });
    if (needed.length === 0) return;

    const keys = needed.map((p) => cacheKey(p, size));
    set((s) => {
      const next = new Set(s.pending);
      for (const k of keys) next.add(k);
      return { pending: next };
    });

    try {
      const result = await invoke<Record<string, string>>("get_google_docs_thumbnails", {
        paths: needed,
        size,
      });
      set((s) => {
        const next = new Set(s.pending);
        for (const k of keys) next.delete(k);
        const merged = { ...s.thumbnails };
        for (const [path, url] of Object.entries(result)) {
          merged[cacheKey(path, size)] = url;
        }
        return { thumbnails: merged, pending: next };
      });
    } catch {
      set((s) => {
        const next = new Set(s.pending);
        for (const k of keys) next.delete(k);
        return { pending: next };
      });
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
          for (const k of keys) next.add(k);
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
            for (const k of keys) next.delete(k);
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
            for (const k of keys) next.delete(k);
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

  // 動画サムネイルのバックグラウンドプリフェッチ（1ファイルずつ処理）
  prefetchVideosInBackground: (paths: string[], size: number) => {
    if (videoPrefetchAbort) videoPrefetchAbort.abort();
    const controller = new AbortController();
    videoPrefetchAbort = controller;

    const { thumbnails, pending } = get();
    const needed = paths.filter((p) => {
      const k = cacheKey(p, size);
      return !thumbnails[k] && !pending.has(k);
    });
    if (needed.length === 0) return;

    (async () => {
      if (!(await checkFfmpeg())) return;

      // 画像サムネイルの読み込みを優先させるため長めに待つ
      await new Promise((r) => setTimeout(r, 1000));
      if (controller.signal.aborted) return;

      for (const path of needed) {
        if (controller.signal.aborted) return;

        const k = cacheKey(path, size);
        const current = get();
        if (current.thumbnails[k] || current.pending.has(k)) continue;

        set((s) => {
          const next = new Set(s.pending);
          next.add(k);
          return { pending: next };
        });

        try {
          const dataUrl = await invoke<string>("extract_video_thumbnail", { path, size });
          if (controller.signal.aborted) return;
          set((s) => {
            const next = new Set(s.pending);
            next.delete(k);
            return { thumbnails: { ...s.thumbnails, [k]: dataUrl }, pending: next };
          });
        } catch {
          if (controller.signal.aborted) return;
          set((s) => {
            const next = new Set(s.pending);
            next.delete(k);
            return { pending: next };
          });
        }

        // FFmpegは重いので間隔を空ける
        if (!controller.signal.aborted) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    })();
  },
  // PDFサムネイルのバックグラウンドプリフェッチ（1ファイルずつ、pdfjs経由）
  prefetchPdfInBackground: (paths: string[], size: number) => {
    if (pdfPrefetchAbort) pdfPrefetchAbort.abort();
    const controller = new AbortController();
    pdfPrefetchAbort = controller;

    const { thumbnails, pending } = get();
    const needed = paths.filter((p) => {
      const k = cacheKey(p, size);
      return !thumbnails[k] && !pending.has(k);
    });
    if (needed.length === 0) return;

    (async () => {
      // 画像・動画サムネイルの読み込みを優先させる
      await new Promise((r) => setTimeout(r, 1200));
      if (controller.signal.aborted) return;

      for (const path of needed) {
        if (controller.signal.aborted) return;

        const k = cacheKey(path, size);
        const current = get();
        if (current.thumbnails[k] || current.pending.has(k)) continue;

        set((s) => {
          const next = new Set(s.pending);
          next.add(k);
          return { pending: next };
        });

        try {
          const dataUrl = await renderPdfThumbnail(path, size);
          if (controller.signal.aborted) return;
          set((s) => {
            const next = new Set(s.pending);
            next.delete(k);
            return { thumbnails: { ...s.thumbnails, [k]: dataUrl }, pending: next };
          });
        } catch {
          if (controller.signal.aborted) return;
          set((s) => {
            const next = new Set(s.pending);
            next.delete(k);
            return { pending: next };
          });
        }

        // PDF描画はやや重いので間隔を空ける
        if (!controller.signal.aborted) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    })();
  },

  // PSDサムネイルのバックグラウンドプリフェッチ（1ファイルずつ、ag-psd経由）
  prefetchPsdInBackground: (paths: string[], size: number) => {
    if (psdPrefetchAbort) psdPrefetchAbort.abort();
    const controller = new AbortController();
    psdPrefetchAbort = controller;

    const { thumbnails, pending } = get();
    const needed = paths.filter((p) => {
      const k = cacheKey(p, size);
      return !thumbnails[k] && !pending.has(k);
    });
    if (needed.length === 0) return;

    (async () => {
      // 他のサムネイル読み込みを優先させる
      await new Promise((r) => setTimeout(r, 1500));
      if (controller.signal.aborted) return;

      for (const path of needed) {
        if (controller.signal.aborted) return;

        const k = cacheKey(path, size);
        const current = get();
        if (current.thumbnails[k] || current.pending.has(k)) continue;

        set((s) => {
          const next = new Set(s.pending);
          next.add(k);
          return { pending: next };
        });

        try {
          const dataUrl = await renderPsdThumbnail(path, size);
          if (controller.signal.aborted) return;
          set((s) => {
            const next = new Set(s.pending);
            next.delete(k);
            return { thumbnails: { ...s.thumbnails, [k]: dataUrl }, pending: next };
          });
        } catch {
          if (controller.signal.aborted) return;
          set((s) => {
            const next = new Set(s.pending);
            next.delete(k);
            return { pending: next };
          });
        }

        // PSDパースは重いので間隔を空ける
        if (!controller.signal.aborted) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    })();
  },

  // Google Docsサムネイルのバックグラウンドプリフェッチ
  prefetchGoogleDocsInBackground: (paths: string[], size: number) => {
    if (gdocsPrefetchAbort) gdocsPrefetchAbort.abort();
    const controller = new AbortController();
    gdocsPrefetchAbort = controller;

    const { thumbnails, pending } = get();
    const needed = paths.filter((p) => {
      const k = cacheKey(p, size);
      return !thumbnails[k] && !pending.has(k);
    });
    if (needed.length === 0) return;

    (async () => {
      // 画像・動画サムネイルの読み込みを優先させる
      await new Promise((r) => setTimeout(r, 400));
      if (controller.signal.aborted) return;

      // 一括取得（DBアクセスのみなのでチャンク不要）
      const current = get();
      const todo = needed.filter((p) => {
        const k = cacheKey(p, size);
        return !current.thumbnails[k] && !current.pending.has(k);
      });
      if (todo.length === 0) return;

      const keys = todo.map((p) => cacheKey(p, size));
      set((s) => {
        const next = new Set(s.pending);
        for (const k of keys) next.add(k);
        return { pending: next };
      });

      try {
        const result = await invoke<Record<string, string>>("get_google_docs_thumbnails", {
          paths: todo,
          size,
        });
        if (controller.signal.aborted) return;
        set((s) => {
          const next = new Set(s.pending);
          for (const k of keys) next.delete(k);
          const merged = { ...s.thumbnails };
          for (const [path, url] of Object.entries(result)) {
            merged[cacheKey(path, size)] = url;
          }
          return { thumbnails: merged, pending: next };
        });
      } catch {
        if (controller.signal.aborted) return;
        set((s) => {
          const next = new Set(s.pending);
          for (const k of keys) next.delete(k);
          return { pending: next };
        });
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

/** エントリ配列から動画パスだけ抽出するヘルパー */
export function extractVideoPaths(
  entries: { is_dir: boolean; extension: string; path: string }[],
): string[] {
  return entries.filter((e) => !e.is_dir && VIDEO_EXTS.has(e.extension)).map((e) => e.path);
}

/** エントリ配列からGoogle Docsパスだけ抽出するヘルパー */
export function extractGoogleDocsPaths(
  entries: { is_dir: boolean; extension: string; path: string }[],
): string[] {
  return entries
    .filter((e) => !e.is_dir && GOOGLE_DOCS_EXTENSIONS.has(e.extension))
    .map((e) => e.path);
}

/** エントリ配列からPDFパスだけ抽出するヘルパー */
export function extractPdfPaths(
  entries: { is_dir: boolean; extension: string; path: string }[],
): string[] {
  return entries.filter((e) => !e.is_dir && PDF_EXTS.has(e.extension)).map((e) => e.path);
}

/** エントリ配列からPSDパスだけ抽出するヘルパー */
export function extractPsdPaths(
  entries: { is_dir: boolean; extension: string; path: string }[],
): string[] {
  return entries.filter((e) => !e.is_dir && PSD_EXTS.has(e.extension)).map((e) => e.path);
}

export { VIDEO_EXTS, PDF_EXTS, PSD_EXTS };
