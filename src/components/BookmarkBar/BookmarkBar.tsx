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

// === Custom Bookmark D&D ===

interface BookmarkDragSource {
  type: "bookmark" | "folder";
  id: string;
  name: string;
}

interface BookmarkDropTarget {
  type: "bookmark" | "folder";
  id: string;
  pos: DropPos;
  ctx: "bar" | "dropdown";
  index: number;
  parentId?: string;
}

type DropPos = "before" | "after" | "inside" | null;

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

/** ドラッグ位置からドロップターゲットを解決 */
function resolveDropTarget(
  x: number,
  y: number,
  source: BookmarkDragSource,
): BookmarkDropTarget | null {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    const item = (el as HTMLElement).closest("[data-bdd-type]") as HTMLElement | null;
    if (!item) continue;
    const type = item.dataset.bddType as "bookmark" | "folder";
    const id = item.dataset.bddId!;
    // 自分自身はスキップ
    if (type === source.type && id === source.id) continue;
    const ctx = (item.dataset.bddCtx || "bar") as "bar" | "dropdown";
    const index = Number(item.dataset.bddIndex ?? -1);
    const parentId = item.dataset.bddParent;
    const rect = item.getBoundingClientRect();
    let pos: DropPos;
    if (ctx === "bar") {
      if (type === "folder") {
        // 3ゾーン: 左25%=before, 中央50%=inside, 右25%=after
        const relX = (x - rect.left) / rect.width;
        pos = relX < 0.25 ? "before" : relX > 0.75 ? "after" : "inside";
      } else {
        const relX = (x - rect.left) / rect.width;
        pos = relX < 0.5 ? "before" : "after";
      }
    } else {
      // ドロップダウン内
      if (type === "folder") {
        pos = "inside";
      } else {
        const relY = (y - rect.top) / rect.height;
        pos = relY < 0.5 ? "before" : "after";
      }
    }
    return { type, id, pos, ctx, index, parentId };
  }
  // バー背景にフォールバック（末尾追加）
  for (const el of els) {
    if ((el as HTMLElement).closest("[data-bdd-bar]")) {
      return { type: "bookmark", id: "__bar_end__", pos: "after", ctx: "bar", index: -1 };
    }
  }
  return null;
}

/** ドロップ実行（Zustandストアを直接使用） */
function executeBddDrop(source: BookmarkDragSource, target: BookmarkDropTarget) {
  const { reorderItem } = useBookmarkStore.getState();
  if (target.id === "__bar_end__") {
    reorderItem(source.type, source.id, null, null, undefined);
    return;
  }
  if (target.ctx === "dropdown") {
    if (target.type === "folder") {
      reorderItem(source.type, source.id, null, null, target.id);
    } else {
      reorderItem(source.type, source.id, target.id, "bookmark", target.parentId);
    }
    return;
  }
  // バー上のドロップ
  if (target.pos === "inside" && target.type === "folder") {
    reorderItem(source.type, source.id, null, null, target.id);
  } else if (target.pos === "before") {
    reorderItem(source.type, source.id, target.id, target.type, undefined);
  } else {
    // "after" → 次のアイテムの前に挿入
    const { bookmarks, folders } = useBookmarkStore.getState();
    const rootItems = getChildItems(bookmarks, folders);
    const next = findNextItem(rootItems, target.index, source.type, source.id);
    if (next) {
      reorderItem(source.type, source.id, next.data.id, next.type, undefined);
    } else {
      reorderItem(source.type, source.id, null, null, undefined);
    }
  }
}

/** ハイライト管理（直接DOM操作） */
let highlightedBddEl: HTMLElement | null = null;

function setBddHighlight(el: HTMLElement | null, pos: DropPos) {
  if (highlightedBddEl && highlightedBddEl !== el) {
    highlightedBddEl.removeAttribute("data-bdd-drop");
  }
  if (el && pos) {
    el.setAttribute("data-bdd-drop", pos);
  }
  highlightedBddEl = el;
}

function clearBddHighlight() {
  if (highlightedBddEl) {
    highlightedBddEl.removeAttribute("data-bdd-drop");
    highlightedBddEl = null;
  }
}

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
  handleItemMouseDown: (
    e: React.MouseEvent,
    type: "bookmark" | "folder",
    id: string,
    name: string,
  ) => void;
}

const BarCtx = createContext<BarContext>(null!);

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
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [ctxMenuPos, setCtxMenuPos] = useState<{ x: number; y: number } | null>(null);
  const barHeight = useSettingsStore((s) => s.bookmarkBarHeight);
  const itemHeight = useSettingsStore((s) => s.bookmarkItemHeight);
  const uiFontSize = useSettingsStore((s) => s.uiFontSize);

  // カスタムD&D状態
  const [dragSource, setDragSource] = useState<BookmarkDragSource | null>(null);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    type: "bookmark" | "folder";
    id: string;
    name: string;
  } | null>(null);
  const dragSourceRef = useRef<BookmarkDragSource | null>(null);
  const dropTargetRef = useRef<BookmarkDropTarget | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);

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
      // ドラッグ中はドロップダウンを閉じない
      if (dragSourceRef.current) return;
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

  // カスタムD&D: ドラッグ開始ハンドラ
  const handleItemMouseDown = useCallback(
    (e: React.MouseEvent, type: "bookmark" | "folder", id: string, name: string) => {
      if (e.button !== 0) return;
      dragStartRef.current = { x: e.clientX, y: e.clientY, type, id, name };
    },
    [],
  );

  // カスタムD&D: グローバルmousemove/mouseupリスナー
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      // Phase 1: 閾値チェック → ドラッグ開始
      if (dragStartRef.current && !dragSourceRef.current) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        if (Math.abs(dx) + Math.abs(dy) < 5) return;
        const { type, id, name } = dragStartRef.current;
        const source = { type, id, name };
        dragSourceRef.current = source;
        setDragSource(source);
        document.body.classList.add("bdd-dragging");
        return;
      }

      // Phase 2: ドラッグ中
      if (!dragSourceRef.current) return;

      // ゴースト位置更新
      if (ghostRef.current) {
        ghostRef.current.style.left = `${e.clientX + 12}px`;
        ghostRef.current.style.top = `${e.clientY - 8}px`;
      }

      // ドロップターゲット解決
      const target = resolveDropTarget(e.clientX, e.clientY, dragSourceRef.current);
      dropTargetRef.current = target;

      if (target && target.id !== "__bar_end__") {
        const targetEl = document.querySelector(
          `[data-bdd-id="${target.id}"][data-bdd-type="${target.type}"]`,
        ) as HTMLElement | null;
        setBddHighlight(targetEl, target.pos);
      } else {
        clearBddHighlight();
      }
    };

    const onMouseUp = () => {
      const source = dragSourceRef.current;
      const target = dropTargetRef.current;

      // 常にクリーンアップ
      dragStartRef.current = null;

      if (!source) return;

      // ドラッグ中だった場合
      clearBddHighlight();
      dragSourceRef.current = null;
      dropTargetRef.current = null;
      setDragSource(null);
      document.body.classList.remove("bdd-dragging");

      if (target) {
        executeBddDrop(source, target);
      }

      // ドラッグ後のclick発火を抑制
      const suppress = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        window.removeEventListener("click", suppress, true);
      };
      window.addEventListener("click", suppress, true);
      setTimeout(() => window.removeEventListener("click", suppress, true), 100);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      clearBddHighlight();
      document.body.classList.remove("bdd-dragging");
    };
  }, []);

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
      handleItemMouseDown,
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
      handleItemMouseDown,
    ],
  );

  return (
    <BarCtx.Provider value={ctx}>
      <div
        data-drop-zone="bookmark-bar"
        data-bdd-bar
        className="flex items-center px-2 border-b border-[var(--chrome-border)] shrink-0 gap-0.5 overflow-x-auto scrollbar-none transition-colors duration-150"
        style={{
          height: barHeight,
          fontSize: uiFontSize,
          background: "var(--chrome-bg)",
          color: "var(--chrome-text-dim)",
        }}
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
          <span className="text-[10px] text-[var(--chrome-text-dim)] select-none opacity-60">
            ★ to bookmark · Drag folders here
          </span>
        )}

        {/* ドラッグゴースト */}
        {dragSource && (
          <div
            ref={ghostRef}
            className="fixed pointer-events-none z-[100] px-2 py-1 bg-white/90 border border-[#d0d0d0] rounded shadow text-xs flex items-center gap-1"
            style={{ left: -9999, top: -9999 }}
          >
            {dragSource.type === "folder" ? (
              <Folder className="w-3 h-3 text-amber-500 shrink-0" />
            ) : (
              <BookmarkIcon className="w-3 h-3 text-[var(--accent)] shrink-0" />
            )}
            <span className="truncate max-w-[120px]">{dragSource.name}</span>
          </div>
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

// === バー上のブックマークボタン ===

function BarBookmarkButton({ bookmark, itemIndex }: { bookmark: Bookmark; itemIndex: number }) {
  const ctx = useContext(BarCtx);

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
    <button
      data-bdd-type="bookmark"
      data-bdd-id={bookmark.id}
      data-bdd-ctx="bar"
      data-bdd-index={itemIndex}
      className={cn(
        "flex items-center gap-1 px-2.5 rounded text-[var(--chrome-text-dim)] hover:bg-[var(--chrome-hover)] shrink-0 cursor-pointer transition-colors max-w-[160px]",
        bookmark.path.toLowerCase() === ctx.currentPath.toLowerCase() &&
          "bg-[var(--chrome-active)] text-[var(--chrome-text)] font-medium",
      )}
      style={{ height: ctx.itemHeight }}
      onClick={() => ctx.navigate(bookmark.path)}
      onMouseDown={(e) => ctx.handleItemMouseDown(e, "bookmark", bookmark.id, bookmark.name)}
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
      title={bookmark.path}
    >
      <BookmarkIcon className="w-3 h-3 text-[var(--chrome-text-dim)] shrink-0" />
      <span className="truncate">{bookmark.name}</span>
    </button>
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
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        data-bdd-type="folder"
        data-bdd-id={folder.id}
        data-bdd-ctx="bar"
        data-bdd-index={itemIndex}
        data-drop-zone="bookmark-folder"
        data-folder-id={folder.id}
        className={cn(
          "flex items-center gap-1 px-2.5 rounded text-[var(--chrome-text-dim)] hover:bg-[var(--chrome-hover)] cursor-pointer transition-colors",
          isOpen && "bg-[var(--chrome-active)]",
        )}
        style={{ height: ctx.itemHeight }}
        onClick={onToggle}
        onMouseDown={(e) => ctx.handleItemMouseDown(e, "folder", folder.id, folder.name)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          ctx.setContextMenu({ x: e.clientX, y: e.clientY, type: "folder", id: folder.id });
        }}
      >
        <Folder className="w-3 h-3 text-amber-500 shrink-0" />
        <span className="truncate max-w-[100px]">{folder.name}</span>
        <ChevronDown
          className={cn(
            "w-2.5 h-2.5 text-[var(--chrome-text-dim)] transition-transform",
            isOpen && "rotate-180",
          )}
        />
        {childItems.length > 0 && (
          <span className="text-[9px] text-[var(--chrome-text-dim)] ml-0.5">
            ({childItems.length})
          </span>
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
      data-bdd-type="bookmark"
      data-bdd-id={bookmark.id}
      data-bdd-ctx="dropdown"
      data-bdd-parent={parentId}
      className={cn(
        "flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[#f0f0f0] transition-colors",
        bookmark.path.toLowerCase() === ctx.currentPath.toLowerCase() && "bg-[#e8f0fe] font-medium",
      )}
      onClick={() => ctx.navigate(bookmark.path)}
      onMouseDown={(e) => ctx.handleItemMouseDown(e, "bookmark", bookmark.id, bookmark.name)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ctx.setContextMenu({ x: e.clientX, y: e.clientY, type: "bookmark", id: bookmark.id });
      }}
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
        data-bdd-type="folder"
        data-bdd-id={folder.id}
        data-bdd-ctx="dropdown"
        className={cn(
          "flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[#f0f0f0] transition-colors",
          isHovered && "bg-[#f0f0f0]",
        )}
        onMouseDown={(e) => ctx.handleItemMouseDown(e, "folder", folder.id, folder.name)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          ctx.setContextMenu({ x: e.clientX, y: e.clientY, type: "folder", id: folder.id });
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
