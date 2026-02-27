import {
  Bookmark as BookmarkIcon,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  Pencil,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Bookmark, BookmarkFolder, BookmarkItem } from "../../stores/bookmarkStore";
import { countDescendants, getChildItems, useBookmarkStore } from "../../stores/bookmarkStore";
import { useExplorerStore } from "../../stores/panelStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { cn } from "../../utils/cn";
import { clampMenuPosition } from "../../utils/menuPosition";

// === D&Dデータ ===

const DRAG_TYPE = "application/x-bookmark-item";

function setItemDragData(e: React.DragEvent, type: "bookmark" | "folder", id: string) {
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ type, id }));
}

function getItemDragData(e: React.DragEvent): { type: "bookmark" | "folder"; id: string } | null {
  const data = e.dataTransfer.getData(DRAG_TYPE);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/** afterIndex の次のアイテムを返す（ドラッグ中アイテムをスキップ） */
function findNextItem(
  rootItems: BookmarkItem[],
  afterIndex: number,
  draggedType: string,
  draggedId: string,
): BookmarkItem | null {
  for (let i = afterIndex + 1; i < rootItems.length; i++) {
    const item = rootItems[i];
    if (item.type !== draggedType || item.data.id !== draggedId) return item;
  }
  return null;
}

type DropPos = "before" | "after" | "inside" | null;

// === コンテキスト ===

interface BarContext {
  bookmarks: Bookmark[];
  folders: BookmarkFolder[];
  rootItems: BookmarkItem[];
  reorderItem: (
    type: "bookmark" | "folder",
    id: string,
    beforeId: string | null,
    beforeType: "bookmark" | "folder" | null,
    targetParentId: string | undefined,
  ) => void;
  addBookmark: (path: string, folderId?: string) => void;
  navigate: (path: string) => void;
  currentPath: string;
  setContextMenu: (
    menu: {
      x: number;
      y: number;
      type: "bookmark" | "folder" | "bar";
      id?: string;
      parentFolderId?: string;
    } | null,
  ) => void;
  renamingId: string | null;
  renameValue: string;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  startRename: (id: string, type: "bookmark" | "folder", name: string) => void;
  setRenameValue: (v: string) => void;
  commitRename: () => void;
  cancelRename: () => void;
  itemHeight: number;
}

const BarCtx = createContext<BarContext>(null!);

// === ドロップインジケータ（縦棒） ===

const DROP_BAR_STYLE =
  "w-[2px] self-stretch my-0.5 rounded-full shrink-0 bg-[var(--accent)] pointer-events-none";

// === メインコンポーネント ===

export function BookmarkBar() {
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const folders = useBookmarkStore((s) => s.folders);
  const loaded = useBookmarkStore((s) => s.loaded);
  const addBookmark = useBookmarkStore((s) => s.addBookmark);
  const removeBookmark = useBookmarkStore((s) => s.removeBookmark);
  const renameBookmark = useBookmarkStore((s) => s.renameBookmark);
  const moveToFolder = useBookmarkStore((s) => s.moveToFolder);
  const addFolder = useBookmarkStore((s) => s.addFolder);
  const removeFolder = useBookmarkStore((s) => s.removeFolder);
  const renameFolder = useBookmarkStore((s) => s.renameFolder);
  const reorderItem = useBookmarkStore((s) => s.reorderItem);
  const navigate = useExplorerStore((s) => s.loadDirectory);
  const tab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0]);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: "bookmark" | "folder" | "bar";
    id?: string;
    parentFolderId?: string;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingType, setRenamingType] = useState<"bookmark" | "folder">("bookmark");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [externalDragOver, setExternalDragOver] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [ctxMenuPos, setCtxMenuPos] = useState<{ x: number; y: number } | null>(null);
  const barHeight = useSettingsStore((s) => s.bookmarkBarHeight);
  const itemHeight = useSettingsStore((s) => s.bookmarkItemHeight);
  const uiFontSize = useSettingsStore((s) => s.uiFontSize);

  useEffect(() => {
    if (!loaded) useBookmarkStore.getState().loadBookmarks();
  }, [loaded]);

  const commitRename = useCallback(() => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      if (renamingType === "bookmark") renameBookmark(renamingId, trimmed);
      else renameFolder(renamingId, trimmed);
    }
    setRenamingId(null);
  }, [renamingId, renameValue, renamingType, renameBookmark, renameFolder]);

  const startRename = useCallback((id: string, type: "bookmark" | "folder", name: string) => {
    setRenamingId(id);
    setRenamingType(type);
    setRenameValue(name);
  }, []);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (!contextMenu && !openFolderId) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-bookmark-ctx]") || target.closest("[data-bookmark-dropdown]"))
        return;
      // リネーム中は入力を確定してからドロップダウンも閉じる
      if (renamingId) {
        commitRename();
      }
      setContextMenu(null);
      setConfirmDeleteId(null);
      setOpenFolderId(null);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [contextMenu, openFolderId, renamingId, commitRename]);

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const rect = contextMenuRef.current.getBoundingClientRect();
    const clamped = clampMenuPosition(contextMenu.x, contextMenu.y, rect.width, rect.height);
    setCtxMenuPos(clamped);
    return () => setCtxMenuPos(null);
  }, [contextMenu]);

  const rootItems = useMemo(() => getChildItems(bookmarks, folders), [bookmarks, folders]);

  // バー空白部分へのD&D（ブックマーク内部D&Dのみ処理。外部ファイルはuseNativeDropが処理）
  const handleBarDragOver = useCallback((e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    if (types.includes(DRAG_TYPE)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setExternalDragOver(true);
    }
  }, []);

  const handleBarDragLeave = useCallback((e: React.DragEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      setExternalDragOver(false);
    }
  }, []);

  const handleBarDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setExternalDragOver(false);

      // ブックマーク内部D&Dの並べ替えのみ処理
      const itemData = getItemDragData(e);
      if (itemData) {
        reorderItem(itemData.type, itemData.id, null, null, undefined);
      }
    },
    [reorderItem],
  );

  const ctx: BarContext = useMemo(
    () => ({
      bookmarks,
      folders,
      rootItems,
      reorderItem,
      addBookmark,
      navigate,
      currentPath: tab.path,
      setContextMenu,
      renamingId,
      renameValue,
      renameInputRef,
      startRename,
      setRenameValue,
      commitRename,
      cancelRename: () => setRenamingId(null),
      itemHeight,
    }),
    [
      bookmarks,
      folders,
      rootItems,
      reorderItem,
      addBookmark,
      navigate,
      tab.path,
      renamingId,
      renameValue,
      startRename,
      commitRename,
      itemHeight,
    ],
  );

  return (
    <BarCtx.Provider value={ctx}>
      <div
        data-drop-zone="bookmark-bar"
        className="flex items-center px-2 border-b border-[#e5e5e5] shrink-0 gap-0.5 overflow-x-auto scrollbar-none transition-colors duration-150"
        style={{
          height: barHeight,
          fontSize: uiFontSize,
          background: externalDragOver
            ? "linear-gradient(rgba(var(--accent-rgb), 0.20), rgba(var(--accent-rgb), 0.20)), #f5f5f5"
            : "linear-gradient(rgba(var(--accent-rgb), 0.08), rgba(var(--accent-rgb), 0.08)), #f5f5f5",
          borderColor: externalDragOver ? "var(--accent)" : undefined,
        }}
        onDragOver={handleBarDragOver}
        onDragLeave={handleBarDragLeave}
        onDrop={handleBarDrop}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY, type: "bar" });
        }}
      >
        {rootItems.map((item, index) =>
          item.type === "folder" ? (
            <BarFolderButton
              key={item.data.id}
              folder={item.data as BookmarkFolder}
              itemIndex={index}
              isOpen={openFolderId === item.data.id}
              onToggle={() => {
                // リネーム中はドロップダウンを閉じない
                if (renamingId) {
                  commitRename();
                  return;
                }
                setOpenFolderId(openFolderId === item.data.id ? null : item.data.id);
              }}
            />
          ) : (
            <BarBookmarkButton
              key={item.data.id}
              bookmark={item.data as Bookmark}
              itemIndex={index}
            />
          ),
        )}

        {bookmarks.length === 0 && folders.length === 0 && (
          <span className="text-[10px] text-[#bbb] select-none">
            ★ to bookmark · Drag folders here
          </span>
        )}

        {/* コンテキストメニュー */}
        {contextMenu && (
          <div
            ref={contextMenuRef}
            data-bookmark-ctx
            className="fixed bg-white border border-[#d0d0d0] rounded-md shadow-lg py-1 z-50 min-w-[140px] animate-fade-scale-in"
            style={{
              left: ctxMenuPos ? ctxMenuPos.x : contextMenu.x,
              top: ctxMenuPos ? ctxMenuPos.y : contextMenu.y,
              visibility: ctxMenuPos ? "visible" : "hidden",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {contextMenu.type === "bookmark" &&
              contextMenu.id &&
              (() => {
                const targetBm = bookmarks.find((b) => b.id === contextMenu.id);
                const isInFolder = !!targetBm?.folderId;
                return (
                  <>
                    <button
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[#f0f0f0]"
                      onClick={() => {
                        const bm = bookmarks.find((b) => b.id === contextMenu.id);
                        setContextMenu(null);
                        if (bm)
                          requestAnimationFrame(() => startRename(bm.id, "bookmark", bm.name));
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                      Rename
                    </button>
                    {(folders.length > 0 || isInFolder) && (
                      <div className="border-t border-[#e5e5e5] my-0.5" />
                    )}
                    {isInFolder && (
                      <button
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[#f0f0f0]"
                        onClick={() => {
                          if (contextMenu.id) moveToFolder(contextMenu.id, undefined);
                          setContextMenu(null);
                        }}
                      >
                        <Folder className="w-3 h-3 text-[#666]" />
                        Move to root
                      </button>
                    )}
                    {folders
                      .filter((f) => f.id !== targetBm?.folderId)
                      .map((f) => (
                        <button
                          key={f.id}
                          className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[#f0f0f0]"
                          onClick={() => {
                            if (contextMenu.id) moveToFolder(contextMenu.id, f.id);
                            setContextMenu(null);
                          }}
                        >
                          <Folder className="w-3 h-3 text-amber-500" />
                          Move to {f.name}
                        </button>
                      ))}
                    <div className="border-t border-[#e5e5e5] my-0.5" />
                    <button
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[#f0f0f0] text-red-600"
                      onClick={() => {
                        if (contextMenu.id) removeBookmark(contextMenu.id);
                        setContextMenu(null);
                      }}
                    >
                      <X className="w-3 h-3" />
                      Remove
                    </button>
                  </>
                );
              })()}
            {contextMenu.type === "folder" &&
              contextMenu.id &&
              (() => {
                const folderId = contextMenu.id;
                const childCount = countDescendants(bookmarks, folders, folderId);
                // 削除確認モード
                if (confirmDeleteId === folderId) {
                  return (
                    <div className="px-3 py-2">
                      <p className="text-xs text-[#555] mb-2">
                        {childCount} item{childCount > 1 ? "s" : ""} will be deleted.
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          className="flex-1 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                          onClick={() => {
                            removeFolder(folderId);
                            setConfirmDeleteId(null);
                            setContextMenu(null);
                          }}
                        >
                          Delete
                        </button>
                        <button
                          className="flex-1 px-2 py-1 text-xs bg-[#e8e8e8] rounded hover:bg-[#d8d8d8]"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <>
                    <button
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[#f0f0f0]"
                      onClick={() => {
                        const f = folders.find((fo) => fo.id === folderId);
                        setContextMenu(null);
                        if (f) requestAnimationFrame(() => startRename(f.id, "folder", f.name));
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                      Rename folder
                    </button>
                    <div className="border-t border-[#e5e5e5] my-0.5" />
                    <button
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[#f0f0f0] text-red-600"
                      onClick={() => {
                        if (childCount > 0) {
                          setConfirmDeleteId(folderId);
                          return;
                        }
                        removeFolder(folderId);
                        setContextMenu(null);
                      }}
                    >
                      <X className="w-3 h-3" />
                      Remove folder
                    </button>
                  </>
                );
              })()}
            {contextMenu.type === "bar" && (
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[#f0f0f0]"
                onClick={() => {
                  const parentId = contextMenu.parentFolderId;
                  const newId = addFolder("New Folder", parentId);
                  setContextMenu(null);
                  // ドロップダウン内の場合は同期的にリネーム開始（rAFだとクローズが先に走る）
                  if (parentId) {
                    startRename(newId, "folder", "New Folder");
                  } else {
                    requestAnimationFrame(() => startRename(newId, "folder", "New Folder"));
                  }
                }}
              >
                <FolderPlus className="w-3 h-3" />
                New bookmark folder
              </button>
            )}
          </div>
        )}
      </div>
    </BarCtx.Provider>
  );
}

// === ドロップ位置からreorderItem呼び出し ===

function executeReorder(
  ctx: BarContext,
  itemData: { type: "bookmark" | "folder"; id: string },
  dropPos: DropPos,
  targetItem: BookmarkItem,
  itemIndex: number,
) {
  if (dropPos === "inside" && targetItem.type === "folder") {
    // フォルダ内に移動
    ctx.reorderItem(itemData.type, itemData.id, null, null, targetItem.data.id);
  } else if (dropPos === "before") {
    // この要素の前に挿入
    ctx.reorderItem(itemData.type, itemData.id, targetItem.data.id, targetItem.type, undefined);
  } else {
    // この要素の後に挿入 → 次のアイテムの前に挿入
    const next = findNextItem(ctx.rootItems, itemIndex, itemData.type, itemData.id);
    if (next) {
      ctx.reorderItem(itemData.type, itemData.id, next.data.id, next.type, undefined);
    } else {
      ctx.reorderItem(itemData.type, itemData.id, null, null, undefined);
    }
  }
}

// === バー上のブックマークボタン ===

function BarBookmarkButton({ bookmark, itemIndex }: { bookmark: Bookmark; itemIndex: number }) {
  const ctx = useContext(BarCtx);
  const [dropPos, setDropPos] = useState<DropPos>(null);

  if (ctx.renamingId === bookmark.id) {
    return (
      <input
        ref={ctx.renameInputRef}
        className="h-5 px-2 text-xs bg-white border border-[var(--accent)] rounded outline-none min-w-[60px] max-w-[160px]"
        value={ctx.renameValue}
        onChange={(e) => ctx.setRenameValue(e.target.value)}
        onBlur={ctx.commitRename}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") ctx.commitRename();
          if (e.key === "Escape") ctx.cancelRename();
        }}
      />
    );
  }

  return (
    <>
      {dropPos === "before" && <div className={DROP_BAR_STYLE} />}
      <button
        draggable
        className={cn(
          "flex items-center gap-1 px-2.5 rounded text-[#555] hover:bg-[#e8e8e8] shrink-0 cursor-pointer transition-colors max-w-[160px]",
          bookmark.path.toLowerCase() === ctx.currentPath.toLowerCase() &&
            "bg-[#e8e8e8] text-[#1a1a1a] font-medium",
        )}
        style={{ height: ctx.itemHeight }}
        onClick={() => ctx.navigate(bookmark.path)}
        data-mid-click-path={bookmark.path}
        onDoubleClick={(e) => {
          e.stopPropagation();
          ctx.startRename(bookmark.id, "bookmark", bookmark.name);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          ctx.setContextMenu({ x: e.clientX, y: e.clientY, type: "bookmark", id: bookmark.id });
        }}
        onDragStart={(e) => setItemDragData(e, "bookmark", bookmark.id)}
        onDragOver={(e) => {
          const types = Array.from(e.dataTransfer.types);
          if (types.includes(DRAG_TYPE)) {
            e.preventDefault();
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = (e.clientX - rect.left) / rect.width;
            setDropPos(relX < 0.5 ? "before" : "after");
          }
        }}
        onDragLeave={() => setDropPos(null)}
        onDrop={(e) => {
          const pos = dropPos;
          setDropPos(null);
          const itemData = getItemDragData(e);
          if (itemData && itemData.id !== bookmark.id) {
            e.preventDefault();
            e.stopPropagation();
            executeReorder(ctx, itemData, pos, { type: "bookmark", data: bookmark }, itemIndex);
          }
        }}
        onDragEnd={() => setDropPos(null)}
        title={bookmark.path}
      >
        <BookmarkIcon className="w-3 h-3 text-[var(--accent)] shrink-0" />
        <span className="truncate">{bookmark.name}</span>
      </button>
      {dropPos === "after" && <div className={DROP_BAR_STYLE} />}
    </>
  );
}

// === バー上のフォルダボタン（ドロップダウン付き） ===

function BarFolderButton({
  folder,
  itemIndex,
  isOpen,
  onToggle,
}: {
  folder: BookmarkFolder;
  itemIndex: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const ctx = useContext(BarCtx);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number } | null>(null);
  const [dropPos, setDropPos] = useState<DropPos>(null);

  const childItems = useMemo(
    () => getChildItems(ctx.bookmarks, ctx.folders, folder.id),
    [ctx.bookmarks, ctx.folders, folder.id],
  );

  useEffect(() => {
    if (!isOpen) {
      setDropdownPos(null);
      return;
    }
    if (buttonRef.current && dropdownRef.current) {
      const btnRect = buttonRef.current.getBoundingClientRect();
      const ddRect = dropdownRef.current.getBoundingClientRect();
      const clamped = clampMenuPosition(
        btnRect.left,
        btnRect.bottom + 2,
        ddRect.width,
        ddRect.height,
      );
      setDropdownPos({ left: clamped.x, top: clamped.y });
    }
  }, [isOpen]);

  if (ctx.renamingId === folder.id) {
    return (
      <div className="relative shrink-0">
        <input
          ref={ctx.renameInputRef}
          className="h-5 px-2 text-xs bg-white border border-[var(--accent)] rounded outline-none min-w-[60px] max-w-[120px]"
          value={ctx.renameValue}
          onChange={(e) => ctx.setRenameValue(e.target.value)}
          onBlur={ctx.commitRename}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") ctx.commitRename();
            if (e.key === "Escape") ctx.cancelRename();
          }}
        />
      </div>
    );
  }

  return (
    <>
      {dropPos === "before" && <div className={DROP_BAR_STYLE} />}
      <div className="relative shrink-0">
        <button
          ref={buttonRef}
          draggable
          data-drop-zone="bookmark-folder"
          data-folder-id={folder.id}
          className={cn(
            "flex items-center gap-1 px-2.5 rounded text-[#555] hover:bg-[#e8e8e8] cursor-pointer transition-colors",
            isOpen && "bg-[#e8e8e8]",
            dropPos === "inside" &&
              "bg-[rgba(var(--accent-rgb),0.2)] outline outline-1 outline-[var(--accent)]",
          )}
          style={{ height: ctx.itemHeight }}
          onClick={onToggle}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            ctx.setContextMenu({ x: e.clientX, y: e.clientY, type: "folder", id: folder.id });
          }}
          onDragStart={(e) => {
            e.stopPropagation();
            setItemDragData(e, "folder", folder.id);
          }}
          onDragOver={(e) => {
            const types = Array.from(e.dataTransfer.types);
            if (types.includes(DRAG_TYPE)) {
              e.preventDefault();
              e.stopPropagation();
              // 3ゾーン: 左25%=before, 中央50%=inside, 右25%=after
              const rect = e.currentTarget.getBoundingClientRect();
              const relX = (e.clientX - rect.left) / rect.width;
              if (relX < 0.25) setDropPos("before");
              else if (relX > 0.75) setDropPos("after");
              else setDropPos("inside");
            }
          }}
          onDragLeave={() => setDropPos(null)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const pos = dropPos;
            setDropPos(null);

            // ブックマーク内部D&Dの並べ替えのみ処理
            const itemData = getItemDragData(e);
            if (itemData && itemData.id !== folder.id) {
              executeReorder(ctx, itemData, pos, { type: "folder", data: folder }, itemIndex);
            }
          }}
          onDragEnd={() => setDropPos(null)}
        >
          <Folder className="w-3 h-3 text-amber-500 shrink-0" />
          <span className="truncate max-w-[100px]">{folder.name}</span>
          <ChevronDown
            className={cn("w-2.5 h-2.5 text-[#999] transition-transform", isOpen && "rotate-180")}
          />
          {childItems.length > 0 && (
            <span className="text-[9px] text-[#999] ml-0.5">({childItems.length})</span>
          )}
        </button>

        {isOpen && (
          <div
            ref={dropdownRef}
            data-bookmark-dropdown
            className="fixed bg-white border border-[#d0d0d0] rounded-md shadow-lg py-1 z-50 min-w-[160px] max-w-[240px] animate-fade-scale-in"
            style={{
              left: dropdownPos?.left ?? 0,
              top: dropdownPos?.top ?? 0,
              visibility: dropdownPos ? "visible" : "hidden",
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              ctx.setContextMenu({
                x: e.clientX,
                y: e.clientY,
                type: "bar",
                parentFolderId: folder.id,
              });
            }}
          >
            <DropdownContent parentId={folder.id} items={childItems} />
          </div>
        )}
      </div>
      {dropPos === "after" && <div className={DROP_BAR_STYLE} />}
    </>
  );
}

// === ドロップダウン内コンテンツ（再帰） ===

function DropdownContent({
  parentId,
  items,
}: {
  parentId: string;
  items: ReturnType<typeof getChildItems>;
}) {
  if (items.length === 0) {
    return <div className="px-3 py-2 text-xs text-[#bbb]">Empty folder</div>;
  }

  return (
    <>
      {items.map((item) =>
        item.type === "folder" ? (
          <DropdownSubfolder key={item.data.id} folder={item.data as BookmarkFolder} />
        ) : (
          <DropdownBookmarkRow
            key={item.data.id}
            bookmark={item.data as Bookmark}
            parentId={parentId}
          />
        ),
      )}
    </>
  );
}

// === ドロップダウン内ブックマーク行 ===

function DropdownBookmarkRow({ bookmark, parentId }: { bookmark: Bookmark; parentId: string }) {
  const ctx = useContext(BarCtx);
  const [isDropTarget, setIsDropTarget] = useState(false);

  if (ctx.renamingId === bookmark.id) {
    return (
      <div className="px-3 py-1.5">
        <input
          ref={ctx.renameInputRef}
          className="h-5 px-2 text-xs bg-white border border-[var(--accent)] rounded outline-none w-full"
          value={ctx.renameValue}
          onChange={(e) => ctx.setRenameValue(e.target.value)}
          onBlur={ctx.commitRename}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") ctx.commitRename();
            if (e.key === "Escape") ctx.cancelRename();
          }}
        />
      </div>
    );
  }

  return (
    <button
      draggable
      className={cn(
        "flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[#f0f0f0] transition-colors",
        bookmark.path.toLowerCase() === ctx.currentPath.toLowerCase() && "bg-[#e8f0fe] font-medium",
        isDropTarget && "bg-[#d8d8d8]",
      )}
      onClick={() => ctx.navigate(bookmark.path)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ctx.setContextMenu({ x: e.clientX, y: e.clientY, type: "bookmark", id: bookmark.id });
      }}
      onDragStart={(e) => {
        e.stopPropagation();
        setItemDragData(e, "bookmark", bookmark.id);
      }}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes(DRAG_TYPE)) {
          e.preventDefault();
          e.stopPropagation();
          setIsDropTarget(true);
        }
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDropTarget(false);
        const itemData = getItemDragData(e);
        if (itemData && itemData.id !== bookmark.id) {
          ctx.reorderItem(itemData.type, itemData.id, bookmark.id, "bookmark", parentId);
        }
      }}
      onDragEnd={() => setIsDropTarget(false)}
      data-mid-click-path={bookmark.path}
      title={bookmark.path}
    >
      <BookmarkIcon className="w-3 h-3 text-[var(--accent)] shrink-0" />
      <span className="truncate">{bookmark.name}</span>
    </button>
  );
}

// === ドロップダウン内サブフォルダ（フライアウトサブメニュー） ===

function DropdownSubfolder({ folder }: { folder: BookmarkFolder }) {
  const ctx = useContext(BarCtx);
  const [isHovered, setIsHovered] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // absolute配置の補正スタイル（オーバーフロー時のみJSで調整）
  const [menuAdjust, setMenuAdjust] = useState<React.CSSProperties | null>(null);

  const childItems = useMemo(
    () => getChildItems(ctx.bookmarks, ctx.folders, folder.id),
    [ctx.bookmarks, ctx.folders, folder.id],
  );

  // サブメニューのオーバーフロー補正
  useEffect(() => {
    if (!isHovered) {
      setMenuAdjust(null);
      return;
    }
    // レイアウト確定後に計算
    const rafId = requestAnimationFrame(() => {
      if (!itemRef.current || !submenuRef.current) return;
      const itemRect = itemRef.current.getBoundingClientRect();
      const menuRect = submenuRef.current.getBoundingClientRect();

      const style: React.CSSProperties = { visibility: "visible" };

      // 右にはみ出す場合は左に展開
      if (itemRect.right + menuRect.width > window.innerWidth) {
        style.left = "auto";
        style.right = "100%";
      }

      // 親ドロップダウンの上端に揃えて真横に出す
      const parentDropdown = itemRef.current.closest("[data-bookmark-dropdown]");
      if (parentDropdown) {
        const parentRect = parentDropdown.getBoundingClientRect();
        style.top = parentRect.top - itemRect.top;
      }

      setMenuAdjust(style);
    });
    return () => cancelAnimationFrame(rafId);
  }, [isHovered]);

  const handleMouseEnter = useCallback(() => {
    clearTimeout(closeTimerRef.current);
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    closeTimerRef.current = setTimeout(() => setIsHovered(false), 200);
  }, []);

  if (ctx.renamingId === folder.id) {
    return (
      <div className="px-3 py-1.5">
        <input
          ref={ctx.renameInputRef}
          className="h-5 px-2 text-xs bg-white border border-[var(--accent)] rounded outline-none w-full"
          value={ctx.renameValue}
          onChange={(e) => ctx.setRenameValue(e.target.value)}
          onBlur={ctx.commitRename}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") ctx.commitRename();
            if (e.key === "Escape") ctx.cancelRename();
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={itemRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        draggable
        className={cn(
          "flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[#f0f0f0] transition-colors",
          (isHovered || isDropTarget) && "bg-[#f0f0f0]",
        )}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          ctx.setContextMenu({ x: e.clientX, y: e.clientY, type: "folder", id: folder.id });
        }}
        onDragStart={(e) => {
          e.stopPropagation();
          setItemDragData(e, "folder", folder.id);
        }}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes(DRAG_TYPE)) {
            e.preventDefault();
            e.stopPropagation();
            setIsDropTarget(true);
          }
        }}
        onDragLeave={() => setIsDropTarget(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDropTarget(false);
          const itemData = getItemDragData(e);
          if (itemData && itemData.id !== folder.id) {
            ctx.reorderItem(itemData.type, itemData.id, null, null, folder.id);
          }
        }}
      >
        <Folder className="w-3 h-3 text-amber-500 shrink-0" />
        <span className="truncate flex-1">{folder.name}</span>
        {childItems.length > 0 && (
          <span className="text-[9px] text-[#999]">({childItems.length})</span>
        )}
        <ChevronRight className="w-2.5 h-2.5 text-[#999] shrink-0" />
      </button>

      {/* absolute配置: 親ドロップダウンの右横に自動展開 */}
      {isHovered && (
        <div
          ref={submenuRef}
          data-bookmark-dropdown
          className="absolute left-full top-0 bg-white border border-[#d0d0d0] rounded-md shadow-lg py-1 z-[51] min-w-[160px] max-w-[240px] animate-fade-scale-in"
          style={{
            visibility: "hidden",
            ...menuAdjust,
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            ctx.setContextMenu({
              x: e.clientX,
              y: e.clientY,
              type: "bar",
              parentFolderId: folder.id,
            });
          }}
        >
          <DropdownContent parentId={folder.id} items={childItems} />
        </div>
      )}
    </div>
  );
}
