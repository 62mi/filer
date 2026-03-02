import { create } from "zustand";

export interface Bookmark {
  id: string;
  name: string;
  path: string;
  /** フォルダ内のブックマーク（省略時はルートレベル） */
  folderId?: string;
  /** 表示順（同一親レベル内） */
  order: number;
}

export interface BookmarkFolder {
  id: string;
  name: string;
  /** 親フォルダID（省略時はルートレベル） */
  parentId?: string;
  /** 表示順（同一親レベル内） */
  order: number;
}

export type BookmarkItem =
  | { type: "bookmark"; data: Bookmark }
  | { type: "folder"; data: BookmarkFolder };

/** 指定parent配下のフォルダ+ブックマークをorder順で返す */
export function getChildItems(
  bookmarks: Bookmark[],
  folders: BookmarkFolder[],
  parentId?: string,
): BookmarkItem[] {
  const items: BookmarkItem[] = [
    ...bookmarks
      .filter((b) => (parentId ? b.folderId === parentId : !b.folderId))
      .map((b) => ({ type: "bookmark" as const, data: b })),
    ...folders
      .filter((f) => (parentId ? f.parentId === parentId : !f.parentId))
      .map((f) => ({ type: "folder" as const, data: f })),
  ];
  return items.sort((a, b) => a.data.order - b.data.order);
}

/** 次のorder番号を取得 */
function getNextOrder(bookmarks: Bookmark[], folders: BookmarkFolder[], parentId?: string): number {
  const orders = [
    ...bookmarks
      .filter((b) => (parentId ? b.folderId === parentId : !b.folderId))
      .map((b) => b.order),
    ...folders
      .filter((f) => (parentId ? f.parentId === parentId : !f.parentId))
      .map((f) => f.order),
  ];
  return orders.length > 0 ? Math.max(...orders) + 1 : 0;
}

/** targetIdがancestorIdの子孫かチェック（循環ネスト防止） */
function isDescendantOf(folders: BookmarkFolder[], ancestorId: string, targetId: string): boolean {
  let current: string | undefined = targetId;
  const visited = new Set<string>();
  while (current) {
    if (current === ancestorId) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    current = folders.find((f) => f.id === current)?.parentId;
  }
  return false;
}

/** フォルダ配下の全アイテム数を再帰カウント */
export function countDescendants(
  bookmarks: Bookmark[],
  folders: BookmarkFolder[],
  folderId: string,
): number {
  let count = 0;
  const stack = [folderId];
  while (stack.length > 0) {
    const pid = stack.pop()!;
    count += bookmarks.filter((b) => b.folderId === pid).length;
    for (const f of folders) {
      if (f.parentId === pid) {
        count++;
        stack.push(f.id);
      }
    }
  }
  return count;
}

interface BookmarkStore {
  bookmarks: Bookmark[];
  folders: BookmarkFolder[];
  loaded: boolean;

  // ブックマーク操作
  addBookmark: (path: string, folderId?: string) => void;
  removeBookmark: (id: string) => void;
  renameBookmark: (id: string, name: string) => void;
  moveToFolder: (bookmarkId: string, folderId: string | undefined) => void;

  // フォルダ操作
  addFolder: (name: string, parentId?: string) => string;
  removeFolder: (id: string) => void;
  renameFolder: (id: string, name: string) => void;

  /** 統合並べ替え: アイテムをbeforeIdの前に移動（null=末尾） */
  reorderItem: (
    type: "bookmark" | "folder",
    id: string,
    beforeId: string | null,
    beforeType: "bookmark" | "folder" | null,
    targetParentId: string | undefined,
  ) => void;

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
    const { bookmarks, folders } = get();
    const existing = bookmarks.find(
      (b) => b.path.toLowerCase() === path.toLowerCase() && b.folderId === folderId,
    );
    if (existing) return;

    const name = path.split("\\").filter(Boolean).pop() || path;
    const order = getNextOrder(bookmarks, folders, folderId);
    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      name,
      path,
      folderId,
      order,
    };
    set((s) => ({ bookmarks: [...s.bookmarks, bookmark] }));
    get().saveBookmarks();
  },

  removeBookmark: (id) => {
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) }));
    get().saveBookmarks();
  },

  renameBookmark: (id, name) => {
    set((s) => ({
      bookmarks: s.bookmarks.map((b) => (b.id === id ? { ...b, name } : b)),
    }));
    get().saveBookmarks();
  },

  moveToFolder: (bookmarkId, folderId) => {
    set((s) => {
      const order = getNextOrder(s.bookmarks, s.folders, folderId);
      return {
        bookmarks: s.bookmarks.map((b) => (b.id === bookmarkId ? { ...b, folderId, order } : b)),
      };
    });
    get().saveBookmarks();
  },

  addFolder: (name, parentId) => {
    const { bookmarks, folders } = get();
    const order = getNextOrder(bookmarks, folders, parentId);
    const folder: BookmarkFolder = {
      id: crypto.randomUUID(),
      name,
      parentId,
      order,
    };
    set((s) => ({ folders: [...s.folders, folder] }));
    get().saveBookmarks();
    return folder.id;
  },

  removeFolder: (id) => {
    set((s) => {
      // 再帰的に削除対象のフォルダIDを収集
      const idsToRemove = new Set<string>([id]);
      let added = true;
      while (added) {
        added = false;
        for (const f of s.folders) {
          if (f.parentId && idsToRemove.has(f.parentId) && !idsToRemove.has(f.id)) {
            idsToRemove.add(f.id);
            added = true;
          }
        }
      }
      return {
        folders: s.folders.filter((f) => !idsToRemove.has(f.id)),
        bookmarks: s.bookmarks.filter((b) => !b.folderId || !idsToRemove.has(b.folderId)),
      };
    });
    get().saveBookmarks();
  },

  renameFolder: (id, name) => {
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? { ...f, name } : f)),
    }));
    get().saveBookmarks();
  },

  reorderItem: (type, id, beforeId, beforeType, targetParentId) => {
    set((s) => {
      const bookmarks = [...s.bookmarks];
      const folders = [...s.folders];

      // アイテムの親を更新
      if (type === "bookmark") {
        const idx = bookmarks.findIndex((b) => b.id === id);
        if (idx < 0) return s;
        bookmarks[idx] = { ...bookmarks[idx], folderId: targetParentId };
      } else {
        const idx = folders.findIndex((f) => f.id === id);
        if (idx < 0) return s;
        // 循環ネスト防止
        if (targetParentId && isDescendantOf(folders, id, targetParentId)) return s;
        folders[idx] = { ...folders[idx], parentId: targetParentId };
      }

      // ターゲットレベルの全兄弟をorder順で取得
      const siblings: Array<{
        type: "bookmark" | "folder";
        id: string;
        order: number;
      }> = [
        ...bookmarks
          .filter((b) => (targetParentId ? b.folderId === targetParentId : !b.folderId))
          .map((b) => ({ type: "bookmark" as const, id: b.id, order: b.order })),
        ...folders
          .filter((f) => (targetParentId ? f.parentId === targetParentId : !f.parentId))
          .map((f) => ({ type: "folder" as const, id: f.id, order: f.order })),
      ];
      siblings.sort((a, b) => a.order - b.order);

      // 移動アイテムを取り除く
      const withoutMoved = siblings.filter((item) => !(item.type === type && item.id === id));
      const moved = siblings.find((item) => item.type === type && item.id === id);
      if (!moved) return s;

      // 挿入位置を決定
      let insertIdx: number;
      if (beforeId === null || beforeType === null) {
        insertIdx = withoutMoved.length;
      } else {
        const targetIdx = withoutMoved.findIndex(
          (item) => item.type === beforeType && item.id === beforeId,
        );
        insertIdx = targetIdx >= 0 ? targetIdx : withoutMoved.length;
      }
      withoutMoved.splice(insertIdx, 0, moved);

      // 連番orderを再割り当て
      for (let i = 0; i < withoutMoved.length; i++) {
        const item = withoutMoved[i];
        if (item.type === "bookmark") {
          const idx = bookmarks.findIndex((b) => b.id === item.id);
          if (idx >= 0) bookmarks[idx] = { ...bookmarks[idx], order: i };
        } else {
          const idx = folders.findIndex((f) => f.id === item.id);
          if (idx >= 0) folders[idx] = { ...folders[idx], order: i };
        }
      }

      return { bookmarks, folders };
    });
    get().saveBookmarks();
  },

  loadBookmarks: () => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      const folderData = localStorage.getItem(FOLDER_STORAGE_KEY);
      const bookmarks: Bookmark[] = data ? JSON.parse(data) : [];
      const folders: BookmarkFolder[] = folderData ? JSON.parse(folderData) : [];

      // マイグレーション: order未設定のアイテムに自動採番
      let needsSave = false;
      const migrateLevel = (parentId?: string) => {
        const childFolders = folders.filter((f) =>
          parentId ? f.parentId === parentId : !f.parentId,
        );
        const childBookmarks = bookmarks.filter((b) =>
          parentId ? b.folderId === parentId : !b.folderId,
        );
        let orderCounter = 0;
        for (const f of childFolders) {
          if (f.order == null) {
            f.order = orderCounter;
            needsSave = true;
          }
          orderCounter++;
        }
        for (const b of childBookmarks) {
          if (b.order == null) {
            b.order = orderCounter;
            needsSave = true;
          }
          orderCounter++;
        }
      };

      migrateLevel(undefined);
      for (const folder of folders) {
        migrateLevel(folder.id);
      }

      set({ bookmarks, folders, loaded: true });
      if (needsSave) get().saveBookmarks();
    } catch (err) {
      console.warn("ブックマークの読み込みに失敗しました:", err);
      set({ loaded: true });
    }
  },

  saveBookmarks: () => {
    const { bookmarks, folders } = get();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
      localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify(folders));
    } catch (err) {
      console.warn("ブックマークの保存に失敗しました:", err);
    }
  },
}));
