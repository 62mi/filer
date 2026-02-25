import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { FileEntry, SortKey, SortOrder, TidinessScore } from "../types";
import { useCopyQueueStore } from "./copyQueueStore";
import { useUndoStore } from "./undoStore";

/** Windowsパスから親ディレクトリを取得 */
function getParentDir(filePath: string): string {
  const normalized = filePath.replace(/\//g, "\\");
  const lastSep = normalized.lastIndexOf("\\");
  if (lastSep <= 0) return normalized;
  if (lastSep === 2 && normalized[1] === ":") return normalized.substring(0, 3);
  return normalized.substring(0, lastSep);
}

/** Windowsパスから拡張子を取得 */
function getExtension(filePath: string): string {
  const normalized = filePath.replace(/\//g, "\\");
  const dot = normalized.lastIndexOf(".");
  const sep = normalized.lastIndexOf("\\");
  return dot > sep ? normalized.substring(dot + 1).toLowerCase() : "";
}

function sortEntries(entries: FileEntry[], key: SortKey, order: SortOrder): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        break;
      case "size":
        cmp = a.size - b.size;
        break;
      case "modified":
        cmp = a.modified - b.modified;
        break;
      case "extension":
        cmp = a.extension.localeCompare(b.extension);
        if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        break;
    }
    return order === "asc" ? cmp : -cmp;
  });
}

interface ClipboardData {
  paths: string[];
  operation: "copy" | "cut";
}

// Per-tab state
interface TabState {
  id: string;
  path: string;
  entries: FileEntry[];
  selectedIndices: Set<number>;
  cursorIndex: number;
  sortKey: SortKey;
  sortOrder: SortOrder;
  loading: boolean;
  error: string | null;
  history: string[];
  historyIndex: number;
  renamingIndex: number | null;
  pendingRenamePath: string | null;
  searchQuery: string;
  searchResults: FileEntry[] | null;
  searching: boolean;
  viewMode: "details" | "icons";
  tidinessScore: TidinessScore | null;
}

function createTabState(path: string): TabState {
  return {
    id: crypto.randomUUID(),
    path,
    entries: [],
    selectedIndices: new Set(),
    cursorIndex: 0,
    sortKey: "name",
    sortOrder: "asc",
    loading: false,
    error: null,
    history: [path],
    historyIndex: 0,
    renamingIndex: null,
    pendingRenamePath: null,
    searchQuery: "",
    searchResults: null,
    searching: false,
    viewMode: "details",
    tidinessScore: null,
  };
}

interface ExplorerStore {
  // Tab management
  tabs: TabState[];
  activeTabId: string;

  // Shared state
  showHidden: boolean;
  clipboard: ClipboardData | null;

  // Tab actions
  addTab: (path?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  nextTab: () => void;
  prevTab: () => void;

  // Active tab getters (convenience)
  getActiveTab: () => TabState;

  // Directory navigation
  loadDirectory: (path: string, addToHistory?: boolean, smooth?: boolean) => Promise<void>;
  refreshDirectory: () => Promise<void>;
  navigateUp: () => Promise<void>;
  navigateBack: () => Promise<void>;
  navigateForward: () => Promise<void>;

  // Selection
  setCursor: (index: number) => void;
  toggleSelection: (index: number) => void;
  selectRange: (fromIndex: number, toIndex: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setSort: (key: SortKey) => void;
  toggleHidden: () => void;

  // File operations
  clipboardCopy: () => void;
  clipboardCut: () => void;
  clipboardPaste: () => Promise<void>;
  deleteSelected: () => Promise<void>;
  createNewFolder: () => Promise<void>;
  createNewFile: () => Promise<void>;
  startRename: (index: number) => void;
  commitRename: (newName: string) => Promise<void>;
  commitRenameAndNext: (newName: string, direction: 1 | -1) => Promise<void>;
  cancelRename: () => void;

  // View mode
  setViewMode: (mode: "details" | "icons") => void;

  // Search
  search: (query: string) => Promise<void>;
  clearSearch: () => void;

  // Stack
  stackItems: string[];
  addToStack: (paths: string[]) => void;
  removeFromStack: (path: string) => void;
  clearStack: () => void;
  pasteFromStack: (operation: "copy" | "move") => Promise<void>;
}

// Helper to update the active tab within the tabs array
function updateActiveTab(
  tabs: TabState[],
  activeTabId: string,
  updater: (tab: TabState) => Partial<TabState>,
): TabState[] {
  return tabs.map((t) => (t.id === activeTabId ? { ...t, ...updater(t) } : t));
}

const initialTab = createTabState("C:\\");

// 煩雑度スコアのデバウンスタイマー
let tidyTimerId: number | null = null;

export const useExplorerStore = create<ExplorerStore>((set, get) => ({
  tabs: [initialTab],
  activeTabId: initialTab.id,
  showHidden: false,
  clipboard: null,
  stackItems: [],

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId) || tabs[0];
  },

  // Tab management
  addTab: (path = "C:\\") => {
    const newTab = createTabState(path);
    set((s) => ({
      tabs: [...s.tabs, newTab],
      activeTabId: newTab.id,
    }));
    // Load directory for the new tab
    get().loadDirectory(path, false);
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    if (tabs.length <= 1) return; // Don't close the last tab
    const idx = tabs.findIndex((t) => t.id === id);
    const newTabs = tabs.filter((t) => t.id !== id);
    let newActiveId = activeTabId;
    if (activeTabId === id) {
      // Switch to neighbor tab
      newActiveId = newTabs[Math.min(idx, newTabs.length - 1)].id;
    }
    set({ tabs: newTabs, activeTabId: newActiveId });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  nextTab: () => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const nextIdx = (idx + 1) % tabs.length;
    set({ activeTabId: tabs[nextIdx].id });
  },

  prevTab: () => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const prevIdx = (idx - 1 + tabs.length) % tabs.length;
    set({ activeTabId: tabs[prevIdx].id });
  },

  // Directory
  // smooth=true: 既存entriesを保持したままバックグラウンド更新（Undo/Redo時のチカチカ防止）
  loadDirectory: async (path, addToHistory = true, smooth = false) => {
    const { activeTabId, showHidden } = get();
    if (!smooth) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, activeTabId, () => ({
          loading: true,
          error: null,
          searchResults: null,
          searchQuery: "",
          searching: false,
        })),
      }));
    }
    try {
      const entries: FileEntry[] = await invoke("list_directory", { path });
      const tab = get().getActiveTab();
      const filtered = showHidden ? entries : entries.filter((e) => !e.is_hidden);
      const sorted = sortEntries(filtered, tab.sortKey, tab.sortOrder);

      let history = tab.history;
      let historyIndex = tab.historyIndex;
      if (addToHistory) {
        history = [...tab.history.slice(0, tab.historyIndex + 1), path];
        historyIndex = history.length - 1;
      }

      set((s) => ({
        tabs: updateActiveTab(s.tabs, activeTabId, () => ({
          path,
          entries: sorted,
          selectedIndices: new Set<number>(),
          cursorIndex: smooth ? Math.min(tab.cursorIndex, sorted.length - 1) : 0,
          loading: false,
          error: null,
          history,
          historyIndex,
          renamingIndex: null,
          tidinessScore: null,
          ...(smooth ? {} : { searchResults: null, searchQuery: "", searching: false }),
        })),
      }));

      // 新規作成後の自動リネーム
      const updatedTab = get().tabs.find((t) => t.id === activeTabId);
      if (updatedTab?.pendingRenamePath) {
        const pendingPath = updatedTab.pendingRenamePath;
        const renameIdx = sorted.findIndex((e) => e.path === pendingPath);
        set((s) => ({
          tabs: updateActiveTab(s.tabs, activeTabId, () => ({
            pendingRenamePath: null,
            ...(renameIdx >= 0 ? { renamingIndex: renameIdx, cursorIndex: renameIdx } : {}),
          })),
        }));
      }

      // 煩雑度スコア Phase B: 非同期でRust側の詳細計算を発火（300msデバウンス）
      if (tidyTimerId) clearTimeout(tidyTimerId);
      const scorePath = path;
      tidyTimerId = window.setTimeout(() => {
        tidyTimerId = null;
        invoke<TidinessScore>("calculate_tidiness_score", { path: scorePath })
          .then((score) => {
            // パスが一致する場合のみ反映（高速フォルダ切替時の古い結果を破棄）
            const current = get().tabs.find((t) => t.id === activeTabId);
            if (current?.path === scorePath) {
              set((s) => ({
                tabs: updateActiveTab(s.tabs, activeTabId, () => ({
                  tidinessScore: score,
                })),
              }));
            }
          })
          .catch(() => {});
      }, 300);
    } catch (e) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, activeTabId, () => ({
          loading: false,
          error: String(e),
        })),
      }));
    }
  },

  refreshDirectory: async () => {
    const tab = get().getActiveTab();
    await get().loadDirectory(tab.path, false);
  },

  navigateUp: async () => {
    const tab = get().getActiveTab();
    try {
      const parent: string = await invoke("get_parent_dir", { path: tab.path });
      if (parent !== tab.path) await get().loadDirectory(parent);
    } catch {
      /* root */
    }
  },

  navigateBack: async () => {
    const tab = get().getActiveTab();
    if (tab.historyIndex > 0) {
      const newIndex = tab.historyIndex - 1;
      set((s) => ({
        tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
          historyIndex: newIndex,
        })),
      }));
      await get().loadDirectory(tab.history[newIndex], false);
    }
  },

  navigateForward: async () => {
    const tab = get().getActiveTab();
    if (tab.historyIndex < tab.history.length - 1) {
      const newIndex = tab.historyIndex + 1;
      set((s) => ({
        tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
          historyIndex: newIndex,
        })),
      }));
      await get().loadDirectory(tab.history[newIndex], false);
    }
  },

  setCursor: (index) => {
    const tab = get().getActiveTab();
    const displayEntries = tab.searchResults ?? tab.entries;
    const len = displayEntries.length;
    set((s) => ({
      tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
        cursorIndex: Math.max(0, Math.min(index, len - 1)),
      })),
    }));
  },

  toggleSelection: (index) => {
    const tab = get().getActiveTab();
    const newSet = new Set(tab.selectedIndices);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    set((s) => ({
      tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
        selectedIndices: newSet,
      })),
    }));
  },

  selectRange: (fromIndex, toIndex) => {
    const tab = get().getActiveTab();
    const newSet = new Set(tab.selectedIndices);
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    for (let i = start; i <= end; i++) {
      newSet.add(i);
    }
    set((s) => ({
      tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
        selectedIndices: newSet,
        cursorIndex: toIndex,
      })),
    }));
  },

  selectAll: () => {
    const tab = get().getActiveTab();
    const displayEntries = tab.searchResults ?? tab.entries;
    const newSet = new Set<number>();
    for (let i = 0; i < displayEntries.length; i++) newSet.add(i);
    set((s) => ({
      tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
        selectedIndices: newSet,
      })),
    }));
  },

  clearSelection: () => {
    set((s) => ({
      tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
        selectedIndices: new Set(),
      })),
    }));
  },

  setSort: (key) => {
    const tab = get().getActiveTab();
    const newOrder: SortOrder = tab.sortKey === key && tab.sortOrder === "asc" ? "desc" : "asc";
    const sorted = sortEntries(tab.entries, key, newOrder);
    set((s) => ({
      tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
        sortKey: key,
        sortOrder: newOrder,
        entries: sorted,
        cursorIndex: 0,
        selectedIndices: new Set(),
      })),
    }));
  },

  toggleHidden: () => {
    set({ showHidden: !get().showHidden });
  },

  // File operations
  clipboardCopy: () => {
    const tab = get().getActiveTab();
    const displayEntries = tab.searchResults ?? tab.entries;
    const indices =
      tab.selectedIndices.size > 0 ? Array.from(tab.selectedIndices) : [tab.cursorIndex];
    const paths = indices.map((i) => displayEntries[i]?.path).filter(Boolean);
    if (paths.length > 0) {
      set({ clipboard: { paths, operation: "copy" } });
    }
  },

  clipboardCut: () => {
    const tab = get().getActiveTab();
    const displayEntries = tab.searchResults ?? tab.entries;
    const indices =
      tab.selectedIndices.size > 0 ? Array.from(tab.selectedIndices) : [tab.cursorIndex];
    const paths = indices.map((i) => displayEntries[i]?.path).filter(Boolean);
    if (paths.length > 0) {
      set({ clipboard: { paths, operation: "cut" } });
    }
  },

  clipboardPaste: async () => {
    const { clipboard } = get();
    const tab = get().getActiveTab();
    if (!clipboard) return;
    try {
      // Undo用に移動先パスを記録
      const entries = clipboard.paths.map((sourcePath) => {
        const fileName = sourcePath.substring(sourcePath.lastIndexOf("\\") + 1);
        return { sourcePath, destPath: `${tab.path}\\${fileName}` };
      });

      if (clipboard.operation === "copy") {
        // コピーはキュー経由（バックグラウンド進捗付き）
        await useCopyQueueStore.getState().enqueue(clipboard.paths, tab.path, "copy");
        useUndoStore.getState().pushAction({ type: "copy", entries });
      } else {
        // 移動はrename（同ドライブなら即座）なので直接実行
        await invoke("move_files", { sources: clipboard.paths, dest: tab.path });
        useUndoStore.getState().pushAction({ type: "move", entries });
        set({ clipboard: null });
      }
      // 移動履歴記録
      const exts = clipboard.paths
        .map((p) => getExtension(p))
        .filter((v, i, a) => a.indexOf(v) === i);
      invoke("record_move_operation", {
        sourceDir: clipboard.paths[0] ? getParentDir(clipboard.paths[0]) : "",
        destDir: tab.path,
        extensions: exts,
        operation: clipboard.operation === "copy" ? "copy" : "move",
        fileCount: clipboard.paths.length,
      }).catch((_err) => {});
      await get().loadDirectory(tab.path, false);
    } catch (e) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
          error: String(e),
        })),
      }));
    }
  },

  deleteSelected: async () => {
    const tab = get().getActiveTab();
    const displayEntries = tab.searchResults ?? tab.entries;
    const indices =
      tab.selectedIndices.size > 0 ? Array.from(tab.selectedIndices) : [tab.cursorIndex];
    const paths = indices.map((i) => displayEntries[i]?.path).filter(Boolean);
    if (paths.length === 0) return;
    try {
      await invoke("delete_files", { paths, toTrash: true });
      // Undo用に削除パスを記録（ゴミ箱送り）
      useUndoStore.getState().pushAction({
        type: "delete",
        entries: paths.map((p) => ({ sourcePath: p, destPath: "" })),
      });
      await get().loadDirectory(tab.path, false);
    } catch (e) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
          error: String(e),
        })),
      }));
    }
  },

  createNewFolder: async () => {
    const tab = get().getActiveTab();
    try {
      const createdPath: string = await invoke("create_directory", {
        path: tab.path,
        name: "New Folder",
      });
      useUndoStore.getState().pushAction({
        type: "create_dir",
        entries: [{ sourcePath: "", destPath: createdPath }],
      });
      set((s) => ({
        tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
          pendingRenamePath: createdPath,
        })),
      }));
      await get().loadDirectory(tab.path, false);
    } catch (e) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
          error: String(e),
        })),
      }));
    }
  },

  createNewFile: async () => {
    const tab = get().getActiveTab();
    try {
      const createdPath: string = await invoke("create_file", {
        path: tab.path,
        name: "New File.txt",
      });
      useUndoStore.getState().pushAction({
        type: "create_file",
        entries: [{ sourcePath: "", destPath: createdPath }],
      });
      set((s) => ({
        tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
          pendingRenamePath: createdPath,
        })),
      }));
      await get().loadDirectory(tab.path, false);
    } catch (e) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
          error: String(e),
        })),
      }));
    }
  },

  startRename: (index) => {
    set((s) => ({
      tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
        renamingIndex: index,
        cursorIndex: index,
      })),
    }));
  },

  commitRename: async (newName) => {
    const tab = get().getActiveTab();
    if (tab.renamingIndex === null) return;
    const entry = tab.entries[tab.renamingIndex];
    if (!entry || newName === entry.name) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
          renamingIndex: null,
        })),
      }));
      return;
    }
    try {
      const newPath: string = await invoke("rename_file", { path: entry.path, newName });
      useUndoStore.getState().pushAction({
        type: "rename",
        entries: [{ sourcePath: entry.path, destPath: newPath }],
      });
      set((s) => ({
        tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
          renamingIndex: null,
        })),
      }));
      await get().loadDirectory(tab.path, false);
    } catch (e) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
          error: String(e),
          renamingIndex: null,
        })),
      }));
    }
  },

  commitRenameAndNext: async (newName, direction) => {
    const tab = get().getActiveTab();
    if (tab.renamingIndex === null) return;
    const entry = tab.entries[tab.renamingIndex];
    if (!entry) return;

    // リネーム実行（名前が変わった場合のみ）
    if (newName !== entry.name) {
      try {
        const newPath: string = await invoke("rename_file", { path: entry.path, newName });
        useUndoStore.getState().pushAction({
          type: "rename",
          entries: [{ sourcePath: entry.path, destPath: newPath }],
        });
      } catch (e) {
        set((s) => ({
          tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
            error: String(e),
            renamingIndex: null,
          })),
        }));
        return;
      }
    }

    // 次/前のファイルへ移動してリネーム開始
    const displayEntries = tab.searchResults ?? tab.entries;
    const nextIndex = tab.renamingIndex + direction;
    if (nextIndex >= 0 && nextIndex < displayEntries.length) {
      // ディレクトリを再読み込みしてからリネーム開始
      await get().loadDirectory(tab.path, false);
      set((s) => ({
        tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
          renamingIndex: nextIndex,
          cursorIndex: nextIndex,
        })),
      }));
    } else {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
          renamingIndex: null,
        })),
      }));
      await get().loadDirectory(tab.path, false);
    }
  },

  setViewMode: (mode) => {
    set((s) => ({
      tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
        viewMode: mode,
      })),
    }));
  },

  cancelRename: () => {
    set((s) => ({
      tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
        renamingIndex: null,
      })),
    }));
  },

  // Search
  search: async (query) => {
    const { activeTabId } = get();
    const tab = get().getActiveTab();
    if (!query.trim()) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, activeTabId, () => ({
          searchResults: null,
          searchQuery: "",
          searching: false,
        })),
      }));
      return;
    }
    set((s) => ({
      tabs: updateActiveTab(s.tabs, activeTabId, () => ({
        searching: true,
        searchQuery: query,
      })),
    }));
    try {
      const results: FileEntry[] = await invoke("search_files", {
        path: tab.path,
        query,
        maxResults: 200,
      });
      set((s) => ({
        tabs: updateActiveTab(s.tabs, activeTabId, () => ({
          searchResults: results,
          searching: false,
        })),
      }));
    } catch (e) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, activeTabId, () => ({
          searching: false,
          error: String(e),
        })),
      }));
    }
  },

  clearSearch: () => {
    set((s) => ({
      tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
        searchResults: null,
        searchQuery: "",
        searching: false,
      })),
    }));
  },

  // Stack
  addToStack: (paths) => {
    set((s) => {
      const existing = new Set(s.stackItems);
      const newItems = paths.filter((p) => !existing.has(p));
      return { stackItems: [...s.stackItems, ...newItems] };
    });
  },

  removeFromStack: (path) => {
    set((s) => ({ stackItems: s.stackItems.filter((p) => p !== path) }));
  },

  clearStack: () => set({ stackItems: [] }),

  pasteFromStack: async (operation) => {
    const { stackItems } = get();
    const tab = get().getActiveTab();
    if (stackItems.length === 0) return;
    try {
      if (operation === "copy") {
        await invoke("copy_files", { sources: stackItems, dest: tab.path });
      } else {
        await invoke("move_files", { sources: stackItems, dest: tab.path });
        set({ stackItems: [] });
      }
      // 移動履歴記録
      const exts = stackItems.map((p) => getExtension(p)).filter((v, i, a) => a.indexOf(v) === i);
      invoke("record_move_operation", {
        sourceDir: stackItems[0] ? getParentDir(stackItems[0]) : "",
        destDir: tab.path,
        extensions: exts,
        operation,
        fileCount: stackItems.length,
      }).catch((_err) => {});
      await get().loadDirectory(tab.path, false);
    } catch (e) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
          error: String(e),
        })),
      }));
    }
  },
}));
