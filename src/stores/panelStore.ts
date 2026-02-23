import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { FileEntry, SortKey, SortOrder } from "../types";

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
  searchQuery: string;
  searchResults: FileEntry[] | null;
  searching: boolean;
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
    searchQuery: "",
    searchResults: null,
    searching: false,
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
  loadDirectory: (path: string, addToHistory?: boolean) => Promise<void>;
  navigateUp: () => Promise<void>;
  navigateBack: () => Promise<void>;
  navigateForward: () => Promise<void>;

  // Selection
  setCursor: (index: number) => void;
  toggleSelection: (index: number) => void;
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
  cancelRename: () => void;

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
  loadDirectory: async (path, addToHistory = true) => {
    const { activeTabId, showHidden } = get();
    set((s) => ({
      tabs: updateActiveTab(s.tabs, activeTabId, () => ({
        loading: true,
        error: null,
        searchResults: null,
        searchQuery: "",
        searching: false,
      })),
    }));
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
          cursorIndex: 0,
          loading: false,
          error: null,
          history,
          historyIndex,
          renamingIndex: null,
        })),
      }));
    } catch (e) {
      set((s) => ({
        tabs: updateActiveTab(s.tabs, activeTabId, () => ({
          loading: false,
          error: String(e),
        })),
      }));
    }
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
      if (clipboard.operation === "copy") {
        await invoke("copy_files", { sources: clipboard.paths, dest: tab.path });
      } else {
        await invoke("move_files", { sources: clipboard.paths, dest: tab.path });
        set({ clipboard: null });
      }
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
      await invoke("create_directory", { path: tab.path, name: "New Folder" });
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
      await invoke("create_file", { path: tab.path, name: "New File.txt" });
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
      await invoke("rename_file", { path: entry.path, newName });
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
