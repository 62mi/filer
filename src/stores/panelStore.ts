import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type {
  FileEntry,
  FileTypeCategory,
  FilterState,
  ModifiedRange,
  SizeRange,
  SortKey,
  SortOrder,
} from "../types";
import { useCopyQueueStore } from "./copyQueueStore";
import { useDirSizeStore } from "./dirSizeStore";
import { toast } from "./toastStore";
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

// フィルタチップ: カテゴリ判定マップ
const FILE_TYPE_MAP: Record<Exclude<FileTypeCategory, "folder">, Set<string>> = {
  image: new Set([
    "png",
    "jpg",
    "jpeg",
    "gif",
    "bmp",
    "webp",
    "svg",
    "ico",
    "tiff",
    "tif",
    "psd",
    "psb",
    "ai",
  ]),
  video: new Set(["mp4", "avi", "mkv", "mov", "wmv", "flv", "webm", "m4v"]),
  audio: new Set(["mp3", "wav", "flac", "aac", "ogg", "wma", "m4a"]),
  document: new Set([
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "txt",
    "md",
    "csv",
    "rtf",
    "html",
  ]),
  archive: new Set(["zip", "rar", "7z", "tar", "gz", "bz2", "lzh"]),
};

function matchesTypeFilter(entry: FileEntry, types: FileTypeCategory[]): boolean {
  if (types.length === 0) return true;
  for (const cat of types) {
    if (cat === "folder") {
      if (entry.is_dir) return true;
    } else if (!entry.is_dir && FILE_TYPE_MAP[cat].has(entry.extension.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function matchesSizeFilter(
  entry: FileEntry,
  range: SizeRange,
  dirSizes: Record<string, number>,
): boolean {
  let size: number;
  if (entry.is_dir) {
    // フォルダ: 計算済みならサイズで判定、未計算なら非表示
    if (!(entry.path in dirSizes)) return false;
    size = dirSizes[entry.path];
  } else {
    size = entry.size;
  }
  const MB = 1024 * 1024;
  const GB = 1024 * MB;
  switch (range) {
    case "small":
      return size < MB;
    case "medium":
      return size >= MB && size < 100 * MB;
    case "large":
      return size >= 100 * MB && size < GB;
    case "huge":
      return size >= GB;
  }
}

function matchesModifiedFilter(entry: FileEntry, range: ModifiedRange): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const modifiedMs = entry.modified * 1000;

  switch (range) {
    case "today":
      return modifiedMs >= today.getTime();
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return modifiedMs >= yesterday.getTime() && modifiedMs < today.getTime();
    }
    case "thisWeek": {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      return modifiedMs >= weekStart.getTime();
    }
    case "thisMonth": {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return modifiedMs >= monthStart.getTime();
    }
    case "thisYear": {
      const yearStart = new Date(today.getFullYear(), 0, 1);
      return modifiedMs >= yearStart.getTime();
    }
    case "older": {
      const yearStart = new Date(today.getFullYear(), 0, 1);
      return modifiedMs < yearStart.getTime();
    }
  }
}

export function applyFilters(
  entries: FileEntry[],
  filter: FilterState,
  dirSizes?: Record<string, number>,
): FileEntry[] {
  if (filter.types.length === 0 && !filter.sizeRange && !filter.modifiedRange) return entries;
  return entries.filter((e) => {
    if (!matchesTypeFilter(e, filter.types)) return false;
    if (filter.sizeRange && !matchesSizeFilter(e, filter.sizeRange, dirSizes ?? {})) return false;
    if (filter.modifiedRange && !matchesModifiedFilter(e, filter.modifiedRange)) return false;
    return true;
  });
}

export const DEFAULT_FILTER: FilterState = { types: [], sizeRange: null, modifiedRange: null };

function sortEntries(entries: FileEntry[], key: SortKey, order: SortOrder): FileEntry[] {
  const dirSizes = useDirSizeStore.getState().sizes;
  return [...entries].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        break;
      case "size": {
        const aSize = a.is_dir ? (dirSizes[a.path] ?? 0) : a.size;
        const bSize = b.is_dir ? (dirSizes[b.path] ?? 0) : b.size;
        cmp = aSize - bSize;
        break;
      }
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

/** ウィンドウ間タブ転送用のシリアライズ可能なタブデータ */
export interface SerializedTab {
  path: string;
  history: string[];
  historyIndex: number;
  sortKey: SortKey;
  sortOrder: SortOrder;
  viewMode: "details" | "icons";
}

interface ClipboardData {
  paths: string[];
  operation: "copy" | "cut";
}

/** ファイル内容検索の結果1件 */
export interface ContentSearchMatch {
  path: string;
  file_name: string;
  line_number: number;
  line_content: string;
  context_before: string[];
  context_after: string[];
}

/** ディレクトリ移動時に保存する表示状態 */
interface DisplayState {
  cursorIndex: number;
  selectedIndices: number[];
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
  searchMode: "name" | "content";
  contentSearchResults: ContentSearchMatch[] | null;
  contentSearching: boolean;
  viewMode: "details" | "icons";
  filter: FilterState;
  displayStateCache: Map<string, DisplayState>;
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
    searchMode: "name",
    contentSearchResults: null,
    contentSearching: false,
    viewMode: "details",
    filter: { ...DEFAULT_FILTER },
    displayStateCache: new Map(),
  };
}

interface ExplorerStore {
  // Tab management
  tabs: TabState[];
  activeTabId: string;

  // Shared state
  showHidden: boolean;
  clipboard: ClipboardData | null;
  cursorVisible: boolean;

  // Tab actions
  addTab: (path?: string, background?: boolean) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  nextTab: () => void;
  prevTab: () => void;

  // Active tab getters (convenience)
  getActiveTab: () => TabState;

  // Directory navigation
  loadDirectory: (path: string, addToHistory?: boolean, smooth?: boolean) => Promise<void>;
  refreshDirectory: () => Promise<void>;
  /** 現在のソートキー/順序でエントリを再ソート（dirSizes更新時などに使用） */
  resortEntries: () => void;
  navigateUp: () => Promise<void>;
  navigateBack: () => Promise<void>;
  navigateForward: () => Promise<void>;

  // Selection
  setCursor: (index: number) => void;
  setCursorVisible: (visible: boolean) => void;
  toggleSelection: (index: number) => void;
  selectRange: (fromIndex: number, toIndex: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setSort: (key: SortKey) => void;
  toggleHidden: () => void;

  // File operations
  clipboardCopy: () => void;
  clipboardCut: () => void;
  clipboardPaste: () => Promise<boolean>;
  deleteSelected: () => Promise<void>;
  createNewFolder: () => Promise<void>;
  createNewFile: () => Promise<void>;
  startRename: (index: number) => void;
  commitRename: (newName: string) => Promise<void>;
  commitRenameAndNext: (newName: string, direction: 1 | -1) => Promise<void>;
  cancelRename: () => void;

  // View mode
  setViewMode: (mode: "details" | "icons") => void;

  // Filter chips
  toggleTypeFilter: (type: FileTypeCategory) => void;
  setSizeFilter: (range: SizeRange | null) => void;
  setModifiedFilter: (range: ModifiedRange | null) => void;
  clearFilters: () => void;

  // Search
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  setSearchMode: (mode: "name" | "content") => void;
  searchContent: (query: string) => Promise<void>;
  clearContentSearch: () => void;

  // External clipboard sync
  syncExternalClipboard: (paths: string[], operation: string) => void;

  // Tab drag & drop
  moveTab: (fromIndex: number, toIndex: number) => void;
  insertTabFromData: (tabData: SerializedTab, atIndex?: number) => void;
  removeTabForTransfer: (id: string) => SerializedTab | null;

  // Stack
  stackItems: string[];
  addToStack: (paths: string[]) => void;
  removeFromStack: (paths: string | string[]) => void;
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

export const useExplorerStore = create<ExplorerStore>((set, get) => ({
  tabs: [initialTab],
  activeTabId: initialTab.id,
  showHidden: false,
  clipboard: null,
  cursorVisible: true,
  stackItems: [],

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId) || tabs[0];
  },

  // Tab management
  addTab: (path = "C:\\", background = false) => {
    const newTab = createTabState(path);
    if (background) {
      // バックグラウンドタブ: アクティブタブを切り替えずにディレクトリを読み込む
      set((s) => ({ tabs: [...s.tabs, newTab] }));
      const { showHidden } = get();
      invoke<FileEntry[]>("list_directory", { path })
        .then((entries) => {
          const filtered = showHidden ? entries : entries.filter((e) => !e.is_hidden);
          const sorted = sortEntries(filtered, "name", "asc");
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === newTab.id ? { ...t, entries: sorted, loading: false } : t,
            ),
          }));
        })
        .catch((err: unknown) => {
          toast.error(
            `ディレクトリ読み込み失敗: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    } else {
      set((s) => ({
        tabs: [...s.tabs, newTab],
        activeTabId: newTab.id,
      }));
      get().loadDirectory(path, false);
    }
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
    const { activeTabId } = get();

    // ホーム画面: バックエンド呼び出し不要
    if (path === "home:") {
      const tab = get().getActiveTab();
      let history = tab.history;
      let historyIndex = tab.historyIndex;
      if (addToHistory) {
        history = [...tab.history.slice(0, tab.historyIndex + 1), path];
        historyIndex = history.length - 1;
      }
      set((s) => ({
        tabs: updateActiveTab(s.tabs, activeTabId, () => ({
          path,
          entries: [],
          selectedIndices: new Set<number>(),
          cursorIndex: 0,
          loading: false,
          error: null,
          history,
          historyIndex,
          renamingIndex: null,
          searchResults: null,
          searchQuery: "",
          searching: false,
          contentSearchResults: null,
          contentSearching: false,
        })),
      }));
      return;
    }

    const { showHidden } = get();

    // 遷移前に現在の表示状態をキャッシュに保存（パスが変わる場合のみ）
    {
      const currentTab = get().getActiveTab();
      if (currentTab.path !== path && currentTab.path !== "home:") {
        const cache = new Map(currentTab.displayStateCache);
        cache.set(currentTab.path, {
          cursorIndex: currentTab.cursorIndex,
          selectedIndices: Array.from(currentTab.selectedIndices),
        });
        set((s) => ({
          tabs: updateActiveTab(s.tabs, activeTabId, () => ({
            displayStateCache: cache,
          })),
        }));
      }
    }

    if (!smooth) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, activeTabId, () => ({
          loading: true,
          error: null,
          searchResults: null,
          searchQuery: "",
          searching: false,
          contentSearchResults: null,
          contentSearching: false,
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

      // キャッシュから表示状態を復元（戻る/進む・クリック操作共通）
      const cached = tab.displayStateCache.get(path);
      const restoredCursor = cached ? Math.min(cached.cursorIndex, sorted.length - 1) : 0;
      const restoredSelection = cached
        ? new Set(cached.selectedIndices.filter((i) => i < sorted.length))
        : new Set<number>();

      set((s) => ({
        tabs: updateActiveTab(s.tabs, activeTabId, () => ({
          path,
          entries: sorted,
          selectedIndices: smooth ? tab.selectedIndices : restoredSelection,
          cursorIndex: smooth ? Math.min(tab.cursorIndex, sorted.length - 1) : restoredCursor,
          loading: false,
          error: null,
          history,
          historyIndex,
          renamingIndex: null,
          ...(smooth ? {} : { searchResults: null, searchQuery: "", searching: false, contentSearchResults: null, contentSearching: false }),
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
            ...(renameIdx >= 0
              ? { renamingIndex: renameIdx, cursorIndex: renameIdx, selectedIndices: new Set([renameIdx]) }
              : {}),
          })),
        }));
      }

      // フォルダサイズ計算: ディレクトリのパスを抽出してリクエスト
      const dirPaths = sorted.filter((e) => e.is_dir).map((e) => e.path);
      useDirSizeStore.getState().requestSizes(dirPaths);
    } catch (e: unknown) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, activeTabId, () => ({
          loading: false,
          error: e instanceof Error ? e.message : String(e),
        })),
      }));
    }
  },

  refreshDirectory: async () => {
    const tab = get().getActiveTab();
    await get().loadDirectory(tab.path, false);
  },

  resortEntries: () => {
    const tab = get().getActiveTab();
    const sorted = sortEntries(tab.entries, tab.sortKey, tab.sortOrder);
    set((s) => ({
      tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
        entries: sorted,
      })),
    }));
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

  setCursorVisible: (visible) => {
    set({ cursorVisible: visible });
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
      invoke("clipboard_write_files", { paths, operation: "copy" }).catch((err: unknown) => {
        toast.error(
          `クリップボード書き込み失敗: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
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
      invoke("clipboard_write_files", { paths, operation: "cut" }).catch((err: unknown) => {
        toast.error(
          `クリップボード書き込み失敗: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
  },

  clipboardPaste: async () => {
    const tab = get().getActiveTab();

    // 1. OSクリップボードからファイルパスを読み取り試行
    let clipData: ClipboardData | null = get().clipboard;
    try {
      const osResult = await invoke<{ paths: string[]; operation: string } | null>(
        "clipboard_read_files",
      );
      if (osResult && osResult.paths.length > 0) {
        clipData = {
          paths: osResult.paths,
          operation: osResult.operation === "cut" ? "cut" : "copy",
        };
      }
    } catch {
      // OS読み取り失敗時は内部クリップボードにフォールバック
    }

    // 2. どちらにもファイルがなければfalseを返す（画像/テキストペーストへのフォールバック用）
    if (!clipData || clipData.paths.length === 0) return false;

    try {
      if (clipData.operation === "copy") {
        await useCopyQueueStore.getState().enqueue(clipData.paths, tab.path, "copy");
        // コピーキューは非同期でリネームされる可能性があるため、undo記録は省略
      } else {
        const actualPaths = await invoke<string[]>("move_files", {
          sources: clipData.paths,
          dest: tab.path,
        });
        // Rust側で重複回避リネームされた実際のパスでundo記録
        const entries = clipData.paths.map((sourcePath, i) => ({
          sourcePath,
          destPath: actualPaths[i],
        }));
        useUndoStore.getState().pushAction({ type: "move", entries });
        set({ clipboard: null });
      }
      // 移動履歴記録
      const exts = clipData.paths
        .map((p) => getExtension(p))
        .filter((v, i, a) => a.indexOf(v) === i);
      invoke("record_move_operation", {
        sourceDir: clipData.paths[0] ? getParentDir(clipData.paths[0]) : "",
        destDir: tab.path,
        extensions: exts,
        operation: clipData.operation === "copy" ? "copy" : "move",
        fileCount: clipData.paths.length,
      }).catch((_err) => {});
      await get().loadDirectory(tab.path, false);
      return true;
    } catch (e: unknown) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
          error: e instanceof Error ? e.message : String(e),
        })),
      }));
      return true; // エラーでもファイルペーストを試みたのでtrue
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
      const result = await invoke<{ succeeded: string[]; failed: [string, string][] }>(
        "delete_files",
        { paths, toTrash: true },
      );
      // 成功分のみUndoスタックに記録
      if (result.succeeded.length > 0) {
        useUndoStore.getState().pushAction({
          type: "delete",
          entries: result.succeeded.map((p) => ({ sourcePath: p, destPath: "" })),
        });
      }
      // 失敗分をトースト通知
      if (result.failed.length > 0) {
        const names = result.failed.map(([p]) => p.substring(p.lastIndexOf("\\") + 1)).join(", ");
        toast.error(`削除に失敗: ${names}`);
      }
      await get().loadDirectory(tab.path, false);
    } catch (e: unknown) {
      toast.error(`削除エラー: ${e instanceof Error ? e.message : String(e)}`);
      await get().loadDirectory(tab.path, false);
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
    } catch (e: unknown) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
          error: e instanceof Error ? e.message : String(e),
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
    } catch (e: unknown) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
          error: e instanceof Error ? e.message : String(e),
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
    } catch (e: unknown) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
          error: e instanceof Error ? e.message : String(e),
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
      } catch (e: unknown) {
        set((s) => ({
          tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
            error: e instanceof Error ? e.message : String(e),
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

  // Filter chips
  toggleTypeFilter: (type) => {
    const tab = get().getActiveTab();
    const types = tab.filter.types.includes(type)
      ? tab.filter.types.filter((t) => t !== type)
      : [...tab.filter.types, type];
    set((s) => ({
      tabs: updateActiveTab(s.tabs, s.activeTabId, (t) => ({
        filter: { ...t.filter, types },
        selectedIndices: new Set(),
        cursorIndex: 0,
      })),
    }));
  },

  setSizeFilter: (range) => {
    set((s) => ({
      tabs: updateActiveTab(s.tabs, s.activeTabId, (t) => ({
        filter: { ...t.filter, sizeRange: range },
        selectedIndices: new Set(),
        cursorIndex: 0,
      })),
    }));
  },

  setModifiedFilter: (range) => {
    set((s) => ({
      tabs: updateActiveTab(s.tabs, s.activeTabId, (t) => ({
        filter: { ...t.filter, modifiedRange: range },
        selectedIndices: new Set(),
        cursorIndex: 0,
      })),
    }));
  },

  clearFilters: () => {
    set((s) => ({
      tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
        filter: { ...DEFAULT_FILTER },
        selectedIndices: new Set(),
        cursorIndex: 0,
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
    } catch (e: unknown) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, activeTabId, () => ({
          searching: false,
          error: e instanceof Error ? e.message : String(e),
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
        contentSearchResults: null,
        contentSearching: false,
      })),
    }));
  },

  setSearchMode: (mode) => {
    set((s) => ({
      tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
        searchMode: mode,
        // モード切替時に検索結果をクリア
        searchResults: null,
        searchQuery: "",
        searching: false,
        contentSearchResults: null,
        contentSearching: false,
      })),
    }));
  },

  searchContent: async (query) => {
    const { activeTabId } = get();
    const tab = get().getActiveTab();
    if (!query.trim()) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, activeTabId, () => ({
          contentSearchResults: null,
          searchQuery: "",
          contentSearching: false,
        })),
      }));
      return;
    }
    set((s) => ({
      tabs: updateActiveTab(s.tabs, activeTabId, () => ({
        contentSearching: true,
        searchQuery: query,
      })),
    }));
    try {
      const results: ContentSearchMatch[] = await invoke("search_file_contents", {
        path: tab.path,
        query,
        maxResults: 100,
      });
      set((s) => ({
        tabs: updateActiveTab(s.tabs, activeTabId, () => ({
          contentSearchResults: results,
          contentSearching: false,
        })),
      }));
    } catch (e: unknown) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, activeTabId, () => ({
          contentSearching: false,
          error: e instanceof Error ? e.message : String(e),
        })),
      }));
    }
  },

  clearContentSearch: () => {
    set((s) => ({
      tabs: updateActiveTab(s.tabs, s.activeTabId, () => ({
        contentSearchResults: null,
        searchQuery: "",
        contentSearching: false,
      })),
    }));
  },

  // External clipboard sync
  syncExternalClipboard: (paths, operation) => {
    const current = get().clipboard;

    // 自己ループ防止: 内部クリップボードと完全一致ならスキップ
    if (
      current &&
      current.paths.length === paths.length &&
      current.paths.every((p, i) => p === paths[i])
    ) {
      return;
    }

    if (paths.length > 0 && (operation === "cut" || operation === "copy")) {
      // 外部カット/コピー検知 → clipboard 更新で半透明化反映
      set({ clipboard: { paths, operation } });
    } else {
      // CF_HDROP なし or 不明な操作
      if (current?.operation === "cut") {
        // 内部カット状態だった → クリアして更新
        set({ clipboard: null });
        get().refreshDirectory();
      }
    }
  },

  // Tab drag & drop
  moveTab: (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    set((s) => {
      const newTabs = [...s.tabs];
      const [moved] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, moved);
      return { tabs: newTabs };
    });
  },

  insertTabFromData: (tabData, atIndex) => {
    const newTab = createTabState(tabData.path);
    newTab.history = tabData.history;
    newTab.historyIndex = tabData.historyIndex;
    newTab.sortKey = tabData.sortKey;
    newTab.sortOrder = tabData.sortOrder;
    newTab.viewMode = tabData.viewMode;

    set((s) => {
      const newTabs = [...s.tabs];
      const insertAt = atIndex !== undefined ? Math.min(atIndex, newTabs.length) : newTabs.length;
      newTabs.splice(insertAt, 0, newTab);
      return { tabs: newTabs, activeTabId: newTab.id };
    });

    // ディレクトリを読み込み
    const { showHidden } = get();
    invoke<FileEntry[]>("list_directory", { path: tabData.path })
      .then((entries) => {
        const filtered = showHidden ? entries : entries.filter((e) => !e.is_hidden);
        const sorted = sortEntries(filtered, tabData.sortKey, tabData.sortOrder);
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === newTab.id ? { ...t, entries: sorted, loading: false } : t,
          ),
        }));
      })
      .catch((err: unknown) => {
        toast.error(
          `ディレクトリ読み込み失敗: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  },

  removeTabForTransfer: (id) => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return null;

    const serialized: SerializedTab = {
      path: tab.path,
      history: tab.history,
      historyIndex: tab.historyIndex,
      sortKey: tab.sortKey,
      sortOrder: tab.sortOrder,
      viewMode: tab.viewMode,
    };

    // タブが1つだけの場合はシリアライズだけして返す（ウィンドウ破棄は呼び出し側で）
    if (tabs.length <= 1) {
      return serialized;
    }

    const idx = tabs.findIndex((t) => t.id === id);
    const newTabs = tabs.filter((t) => t.id !== id);
    let newActiveId = activeTabId;
    if (activeTabId === id) {
      newActiveId = newTabs[Math.min(idx, newTabs.length - 1)].id;
    }
    set({ tabs: newTabs, activeTabId: newActiveId });
    return serialized;
  },

  // Stack
  addToStack: (paths) => {
    set((s) => {
      const existing = new Set(s.stackItems);
      const newItems = paths.filter((p) => !existing.has(p));
      return { stackItems: [...s.stackItems, ...newItems] };
    });
  },

  removeFromStack: (paths) => {
    const arr = Array.isArray(paths) ? paths : [paths];
    const toRemove = new Set(arr);
    set((s) => ({ stackItems: s.stackItems.filter((p) => !toRemove.has(p)) }));
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
      }
      set({ stackItems: [] });
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
    } catch (e: unknown) {
      toast.error(
        `スタック${operation === "copy" ? "コピー" : "移動"}に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
}));
