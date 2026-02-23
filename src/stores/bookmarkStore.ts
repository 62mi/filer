import { create } from "zustand";

export interface Bookmark {
  id: string;
  name: string;
  path: string;
  /** フォルダ内のブックマーク（省略時はルートレベル） */
  folderId?: string;
}

export interface BookmarkFolder {
  id: string;
  name: string;
}

interface BookmarkStore {
  bookmarks: Bookmark[];
  folders: BookmarkFolder[];
  loaded: boolean;

  // ブックマーク操作
  addBookmark: (path: string, folderId?: string) => void;
  removeBookmark: (id: string) => void;
  reorderBookmarks: (fromIndex: number, toIndex: number) => void;
  renameBookmark: (id: string, name: string) => void;
  moveToFolder: (bookmarkId: string, folderId: string | undefined) => void;

  // フォルダ操作
  addFolder: (name: string) => void;
  removeFolder: (id: string) => void;
  renameFolder: (id: string, name: string) => void;

  // 永続化
  loadBookmarks: () => void;
  saveBookmarks: () => void;
}

const STORAGE_KEY = "filer-bookmarks";
const FOLDER_STORAGE_KEY = "filer-bookmark-folders";

export const useBookmarkStore = create<BookmarkStore>((set, get) => ({
  bookmarks: [],
  folders: [],
  loaded: false,

  addBookmark: (path, folderId) => {
    // 重複チェック
    const existing = get().bookmarks.find(
      (b) => b.path.toLowerCase() === path.toLowerCase() && b.folderId === folderId,
    );
    if (existing) return;

    const name = path.split("\\").filter(Boolean).pop() || path;
    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      name,
      path,
      folderId,
    };
    set((s) => ({ bookmarks: [...s.bookmarks, bookmark] }));
    get().saveBookmarks();
  },

  removeBookmark: (id) => {
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) }));
    get().saveBookmarks();
  },

  reorderBookmarks: (fromIndex, toIndex) => {
    set((s) => {
      const newBookmarks = [...s.bookmarks];
      const [moved] = newBookmarks.splice(fromIndex, 1);
      newBookmarks.splice(toIndex, 0, moved);
      return { bookmarks: newBookmarks };
    });
    get().saveBookmarks();
  },

  renameBookmark: (id, name) => {
    set((s) => ({
      bookmarks: s.bookmarks.map((b) => (b.id === id ? { ...b, name } : b)),
    }));
    get().saveBookmarks();
  },

  moveToFolder: (bookmarkId, folderId) => {
    set((s) => ({
      bookmarks: s.bookmarks.map((b) => (b.id === bookmarkId ? { ...b, folderId } : b)),
    }));
    get().saveBookmarks();
  },

  addFolder: (name) => {
    const folder: BookmarkFolder = {
      id: crypto.randomUUID(),
      name,
    };
    set((s) => ({ folders: [...s.folders, folder] }));
    get().saveBookmarks();
  },

  removeFolder: (id) => {
    // フォルダ内のブックマークをルートに移動
    set((s) => ({
      folders: s.folders.filter((f) => f.id !== id),
      bookmarks: s.bookmarks.map((b) => (b.folderId === id ? { ...b, folderId: undefined } : b)),
    }));
    get().saveBookmarks();
  },

  renameFolder: (id, name) => {
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? { ...f, name } : f)),
    }));
    get().saveBookmarks();
  },

  loadBookmarks: () => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      const folderData = localStorage.getItem(FOLDER_STORAGE_KEY);
      const bookmarks: Bookmark[] = data ? JSON.parse(data) : [];
      const folders: BookmarkFolder[] = folderData ? JSON.parse(folderData) : [];
      set({ bookmarks, folders, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  saveBookmarks: () => {
    const { bookmarks, folders } = get();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
      localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify(folders));
    } catch {
      // ストレージフル等は無視
    }
  },
}));
