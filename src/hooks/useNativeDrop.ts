/**
 * グローバルネイティブドロップハンドラ。
 * Tauri v2の `onDragDropEvent` を使い、外部/内部からのファイルドロップを一元管理する。
 * `data-drop-zone` 属性で各要素がドロップ対象であることを宣言し、
 * ドロップ先に応じた処理（移動・コピー・グループ化・ブックマーク追加等）を実行する。
 */

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect } from "react";
import { useBookmarkStore } from "../stores/bookmarkStore";
import { useExplorerStore } from "../stores/panelStore";
import { useSuggestionStore } from "../stores/suggestionStore";
import { toast } from "../stores/toastStore";
import { useUndoStore } from "../stores/undoStore";

/** 直近のハイライト対象要素 */
let highlightedEl: HTMLElement | null = null;

/** drop-zone要素をポインタ座標から探す */
export function findDropZone(x: number, y: number): HTMLElement | null {
  const elements = document.elementsFromPoint(x, y);
  for (const el of elements) {
    const zone = (el as HTMLElement).closest("[data-drop-zone]") as HTMLElement | null;
    if (zone) return zone;
  }
  return null;
}

/** ゾーン別のハイライトスタイル */
const ZONE_STYLES: Record<string, { bg: string; shadow: string }> = {
  "file-row": { bg: "rgba(0,120,212,0.15)", shadow: "inset 0 0 0 1px #0078d4" },
  "panel-bg": { bg: "rgba(0,120,212,0.08)", shadow: "" },
  "sidebar-stack": { bg: "rgba(0,120,212,0.18)", shadow: "inset 0 0 0 1.5px #0078d4" },
  "bookmark-bar": { bg: "rgba(0,120,212,0.20)", shadow: "" },
  "bookmark-folder": { bg: "rgba(0,120,212,0.20)", shadow: "" },
  "sidebar-trash": { bg: "rgba(220,38,38,0.15)", shadow: "inset 0 0 0 1.5px #dc2626" },
  suggestion: { bg: "#cce8ff", shadow: "" },
};

/** ハイライト付与 / 解除（インラインスタイルで確実に適用） */
export function setHighlight(el: HTMLElement | null) {
  if (highlightedEl && highlightedEl !== el) {
    highlightedEl.style.background = "";
    highlightedEl.style.boxShadow = "";
    highlightedEl.removeAttribute("data-native-drop-hover");
  }
  if (el) {
    const zone = el.getAttribute("data-drop-zone") || "";
    const style = ZONE_STYLES[zone];
    if (style) {
      el.style.background = style.bg;
      el.style.boxShadow = style.shadow;
    }
    // file-rowのフォルダ化アニメーションはCSS側で処理（data属性必要）
    el.setAttribute("data-native-drop-hover", "true");
  }
  highlightedEl = el;
}

export function clearHighlight() {
  if (highlightedEl) {
    highlightedEl.style.background = "";
    highlightedEl.style.boxShadow = "";
    highlightedEl.removeAttribute("data-native-drop-hover");
    highlightedEl = null;
  }
}

/** Windows パスからファイル名を取得 */
function getFileName(path: string): string {
  const sep = path.lastIndexOf("\\");
  return sep >= 0 ? path.substring(sep + 1) : path;
}

/** パスから親ディレクトリを取得 */
function getParentDir(path: string): string {
  const sep = path.lastIndexOf("\\");
  return sep >= 0 ? path.substring(0, sep) : "";
}

/** パスから拡張子を取得 */
function getExtension(path: string): string {
  const name = getFileName(path);
  const dot = name.lastIndexOf(".");
  const sep = name.lastIndexOf("\\");
  return dot > sep && dot > 0 ? name.substring(dot + 1).toLowerCase() : "";
}

/** ドロップ処理の実行 */
export async function handleNativeDrop(paths: string[], x: number, y: number) {
  const zone = findDropZone(x, y);
  clearHighlight();

  if (!zone) {
    // ゾーン外: パネル背景にフォールバック
    await handlePanelBgDrop(paths);
    return;
  }

  const zoneType = zone.getAttribute("data-drop-zone");

  switch (zoneType) {
    case "file-row": {
      const filePath = zone.getAttribute("data-file-path");
      const isDir = zone.getAttribute("data-is-dir") === "true";
      if (!filePath) return;

      // ドロップ元にターゲット自身が含まれる場合は何もしない
      if (paths.some((p) => p.toLowerCase() === filePath.toLowerCase())) return;

      if (isDir) {
        await handleMoveToFolder(paths, filePath);
      } else {
        await handleFolderize(paths, filePath);
      }
      break;
    }

    case "panel-bg": {
      const panelPath = zone.getAttribute("data-panel-path");
      if (panelPath) {
        await handleMoveToDir(paths, panelPath);
      }
      break;
    }

    case "sidebar-stack": {
      useExplorerStore.getState().addToStack(paths);
      break;
    }

    case "sidebar-trash": {
      await handleTrashDrop(paths);
      break;
    }

    case "bookmark-bar": {
      for (const p of paths) {
        useBookmarkStore.getState().addBookmark(p);
      }
      break;
    }

    case "bookmark-folder": {
      const folderId = zone.getAttribute("data-folder-id");
      if (folderId) {
        for (const p of paths) {
          useBookmarkStore.getState().addBookmark(p, folderId);
        }
      }
      break;
    }

    case "suggestion": {
      const suggestionPath = zone.getAttribute("data-suggestion-path");
      if (suggestionPath) {
        await handleMoveToDir(paths, suggestionPath);
        useSuggestionStore.getState().hide();
      }
      break;
    }

    default:
      // 不明なゾーン: パネル背景扱い
      await handlePanelBgDrop(paths);
      break;
  }
}

/** ゴミ箱ドロップ: ファイルをゴミ箱に送る */
async function handleTrashDrop(paths: string[]) {
  try {
    const result = await invoke<{ succeeded: string[]; failed: [string, string][] }>(
      "delete_files",
      { paths, toTrash: true },
    );
    if (result.succeeded.length > 0) {
      useUndoStore.getState().pushAction({
        type: "delete",
        entries: result.succeeded.map((p) => ({ sourcePath: p, destPath: "" })),
      });
    }
    if (result.failed.length > 0) {
      toast.error(
        `${result.failed.length}件の削除に失敗: ${result.failed[0][1]}`,
      );
    }
    useExplorerStore.getState().refreshDirectory();
  } catch (err: unknown) {
    toast.error(`ゴミ箱への移動に失敗: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** パネル背景へのドロップ: 現在ディレクトリに移動 */
async function handlePanelBgDrop(paths: string[]) {
  const state = useExplorerStore.getState();
  const tab = state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0];
  await handleMoveToDir(paths, tab.path);
}

/** 指定ディレクトリへの移動 */
async function handleMoveToDir(paths: string[], destDir: string) {
  try {
    // 同一ディレクトリからの移動は無視
    const allFromHere = paths.every((p) => {
      const parent = getParentDir(p);
      return parent.toLowerCase() === destDir.toLowerCase();
    });
    if (allFromHere) return;

    const undoEntries = paths.map((p) => ({
      sourcePath: p,
      destPath: `${destDir}\\${getFileName(p)}`,
    }));

    await invoke("move_files", { sources: paths, dest: destDir });
    useUndoStore.getState().pushAction({ type: "move", entries: undoEntries });

    // 移動履歴記録
    const sourceDir = getParentDir(paths[0] || "");
    const exts = [...new Set(paths.map(getExtension).filter(Boolean))];
    invoke("record_move_operation", {
      sourceDir,
      destDir,
      extensions: exts,
      operation: "move",
      fileCount: paths.length,
    }).catch(() => {});

    useExplorerStore.getState().refreshDirectory();
  } catch (err: unknown) {
    toast.error(`ファイル移動に失敗: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** フォルダへの移動（Ctrl=コピー対応） */
async function handleMoveToFolder(paths: string[], folderPath: string) {
  try {
    const undoEntries = paths.map((p) => ({
      sourcePath: p,
      destPath: `${folderPath}\\${getFileName(p)}`,
    }));

    await invoke("move_files", { sources: paths, dest: folderPath });
    useUndoStore.getState().pushAction({ type: "move", entries: undoEntries });

    // 履歴記録
    const state = useExplorerStore.getState();
    const tab = state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0];
    const exts = [...new Set(paths.map(getExtension).filter(Boolean))];
    invoke("record_move_operation", {
      sourceDir: tab.path,
      destDir: folderPath,
      extensions: exts,
      operation: "move",
      fileCount: paths.length,
    }).catch(() => {});

    useExplorerStore.getState().refreshDirectory();
  } catch (err: unknown) {
    toast.error(`ファイル移動に失敗: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** ファイル on ファイル → グループ化（フォルダ自動作成） */
async function handleFolderize(dragPaths: string[], targetPath: string) {
  try {
    const folderPath: string = await invoke("group_files_into_folder", {
      dragPaths,
      targetPath,
    });

    const allPaths = [targetPath, ...dragPaths];
    useUndoStore.getState().pushAction({
      type: "folderize",
      entries: allPaths.map((p) => ({
        sourcePath: p,
        destPath: `${folderPath}\\${getFileName(p)}`,
      })),
      createdFolder: folderPath,
    });

    useExplorerStore.getState().refreshDirectory();
  } catch (err: unknown) {
    toast.error(`グループ化に失敗: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * App.tsx で1回だけ呼び出すカスタムフック。
 * `onDragDropEvent` で外部ドロップを一元管理する。
 */
export function useNativeDrop() {
  useEffect(() => {
    const webview = getCurrentWebview();
    const unlistenPromise = webview.onDragDropEvent((event) => {
      const { type } = event.payload;

      if (type === "over") {
        const { position } = event.payload;
        const zone = findDropZone(position.x, position.y);
        setHighlight(zone);
      } else if (type === "drop") {
        const { paths, position } = event.payload;
        if (paths.length > 0) {
          handleNativeDrop(paths, position.x, position.y);
        }
        clearHighlight();
      } else if (type === "leave" || type === "enter") {
        // enter: ドラッグがウィンドウに入った
        // leave: ドラッグがウィンドウから出た
        if (type === "leave") {
          clearHighlight();
        }
      }
    });

    return () => {
      unlistenPromise.then((fn) => fn()).catch(() => {});
      clearHighlight();
    };
  }, []);
}
