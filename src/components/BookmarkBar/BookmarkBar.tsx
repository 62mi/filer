import { ChevronDown, Folder, FolderPlus, Pencil, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BookmarkFolder } from "../../stores/bookmarkStore";
import { useBookmarkStore } from "../../stores/bookmarkStore";
import { useExplorerStore } from "../../stores/panelStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { cn } from "../../utils/cn";
import { clampMenuPosition } from "../../utils/menuPosition";

export function BookmarkBar() {
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const folders = useBookmarkStore((s) => s.folders);
  const loaded = useBookmarkStore((s) => s.loaded);
  const addBookmark = useBookmarkStore((s) => s.addBookmark);
  const removeBookmark = useBookmarkStore((s) => s.removeBookmark);
  const renameBookmark = useBookmarkStore((s) => s.renameBookmark);
  const reorderBookmarks = useBookmarkStore((s) => s.reorderBookmarks);
  const addFolder = useBookmarkStore((s) => s.addFolder);
  const removeFolder = useBookmarkStore((s) => s.removeFolder);
  const renameFolder = useBookmarkStore((s) => s.renameFolder);
  const moveToFolder = useBookmarkStore((s) => s.moveToFolder);
  const loadDirectory = useExplorerStore((s) => s.loadDirectory);
  const tab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0]);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: "bookmark" | "folder" | "bar";
    id?: string;
  } | null>(null);
  // リネーム状態
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingType, setRenamingType] = useState<"bookmark" | "folder">("bookmark");
  const renameInputRef = useRef<HTMLInputElement>(null);
  // フォルダドロップダウン
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  // 外部D&D受付中の表示
  const [externalDragOver, setExternalDragOver] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const barHeight = useSettingsStore((s) => s.bookmarkBarHeight);
  const itemHeight = useSettingsStore((s) => s.bookmarkItemHeight);
  const uiFontSize = useSettingsStore((s) => s.uiFontSize);

  // 初回読み込み
  useEffect(() => {
    if (!loaded) {
      useBookmarkStore.getState().loadBookmarks();
    }
  }, [loaded]);

  // リネーム入力にフォーカス
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  // コンテキストメニューとフォルダドロップダウンを閉じる（mousedownで）
  useEffect(() => {
    if (!contextMenu && !openFolderId) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // コンテキストメニューやドロップダウン内のクリックは除外
      if (target.closest("[data-bookmark-ctx]") || target.closest("[data-bookmark-dropdown]"))
        return;
      setContextMenu(null);
      setOpenFolderId(null);
    };
    // mousedownで閉じる（click前に発火するので、RenameボタンのonClickと衝突しない）
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [contextMenu, openFolderId]);

  // コンテキストメニューをビューポート内にクランプ
  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const rect = contextMenuRef.current.getBoundingClientRect();
    const clamped = clampMenuPosition(contextMenu.x, contextMenu.y, rect.width, rect.height);
    contextMenuRef.current.style.left = `${clamped.x}px`;
    contextMenuRef.current.style.top = `${clamped.y}px`;
  }, [contextMenu]);

  // ブックマーク同士のD&D（並べ替え）
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-bookmark-index", String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDropIndex(index);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      // ブックマーク同士の並べ替え
      const bookmarkIdx = e.dataTransfer.getData("application/x-bookmark-index");
      if (bookmarkIdx !== "" && dragIndex !== null && dragIndex !== toIndex) {
        reorderBookmarks(dragIndex, toIndex);
      }
      setDragIndex(null);
      setDropIndex(null);
    },
    [dragIndex, reorderBookmarks],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropIndex(null);
    setExternalDragOver(false);
  }, []);

  // ファイルリストからのD&Dでブックマーク追加
  const handleBarDragOver = useCallback((e: React.DragEvent) => {
    // ファイルリストからのドラッグを検出（types は DOMStringList なので Array.from で安全に）
    const types = Array.from(e.dataTransfer.types);
    if (types.includes("application/x-filer-paths") || types.includes("text/plain")) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      setExternalDragOver(true);
    }
  }, []);

  const handleBarDragLeave = useCallback((e: React.DragEvent) => {
    // バーの外に出たときだけリセット
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

      // まず filer-paths を試す、なければ text/plain をフォールバック
      const pathsJson = e.dataTransfer.getData("application/x-filer-paths");
      if (pathsJson) {
        try {
          const paths: string[] = JSON.parse(pathsJson);
          for (const path of paths) {
            addBookmark(path);
          }
        } catch {
          /* ignore */
        }
        return;
      }
      // text/plain フォールバック（ファイルパスが直接入っている場合）
      const plainText = e.dataTransfer.getData("text/plain");
      if (plainText && (plainText.includes("\\") || plainText.includes("/"))) {
        addBookmark(plainText.trim());
      }
    },
    [addBookmark],
  );

  // リネーム確定
  const commitRename = useCallback(() => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      if (renamingType === "bookmark") {
        renameBookmark(renamingId, trimmed);
      } else {
        renameFolder(renamingId, trimmed);
      }
    }
    setRenamingId(null);
  }, [renamingId, renameValue, renamingType, renameBookmark, renameFolder]);

  // ルートレベルのブックマーク（folderId無し）
  const rootBookmarks = bookmarks.filter((b) => !b.folderId);

  return (
    <div
      className={cn(
        "flex items-center px-2 bg-[#fafafa] border-b border-[#e5e5e5] shrink-0 gap-0.5 overflow-x-auto scrollbar-none transition-colors duration-150",
        externalDragOver && "bg-[#e8f0fe] border-[#0078d4]",
      )}
      style={{ height: barHeight, fontSize: uiFontSize }}
      onDragOver={handleBarDragOver}
      onDragLeave={handleBarDragLeave}
      onDrop={handleBarDrop}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, type: "bar" });
      }}
    >
      {/* ブックマークフォルダ */}
      {folders.map((folder) => (
        <BookmarkFolderItem
          key={folder.id}
          folder={folder}
          isOpen={openFolderId === folder.id}
          onToggle={() => setOpenFolderId(openFolderId === folder.id ? null : folder.id)}
          onNavigate={loadDirectory}
          currentPath={tab.path}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, type: "folder", id: folder.id });
          }}
          renamingId={renamingId}
          renameValue={renameValue}
          renameInputRef={renameInputRef}
          onSetRenameValue={setRenameValue}
          onCommitRename={commitRename}
          onCancelRename={() => setRenamingId(null)}
        />
      ))}

      {folders.length > 0 && rootBookmarks.length > 0 && (
        <div className="w-px h-3.5 bg-[#ddd] shrink-0 mx-0.5" />
      )}

      {/* ルートレベルのブックマーク */}
      {rootBookmarks.map((bookmark) => {
        const globalIndex = bookmarks.indexOf(bookmark);
        return renamingId === bookmark.id ? (
          <input
            key={bookmark.id}
            ref={renameInputRef}
            className="h-5 px-2 text-xs bg-white border border-[#0078d4] rounded outline-none min-w-[60px] max-w-[160px]"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenamingId(null);
            }}
          />
        ) : (
          <button
            key={bookmark.id}
            draggable
            className={cn(
              "flex items-center gap-1 px-2.5 rounded text-[#555] hover:bg-[#e8e8e8] shrink-0 cursor-pointer transition-colors max-w-[160px]",
              dropIndex === globalIndex && dragIndex !== null && "bg-[#d8d8d8]",
              bookmark.path.toLowerCase() === tab.path.toLowerCase() &&
                "bg-[#e8e8e8] text-[#1a1a1a] font-medium",
            )}
            style={{ height: itemHeight }}
            onClick={() => loadDirectory(bookmark.path)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenamingId(bookmark.id);
              setRenamingType("bookmark");
              setRenameValue(bookmark.name);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, type: "bookmark", id: bookmark.id });
            }}
            onDragStart={(e) => handleDragStart(e, globalIndex)}
            onDragOver={(e) => {
              // 外部（ファイルリスト）からのD&Dはバーに委譲
              const types = Array.from(e.dataTransfer.types);
              if (
                types.includes("application/x-filer-paths") &&
                !types.includes("application/x-bookmark-index")
              ) {
                handleBarDragOver(e);
                return;
              }
              handleDragOver(e, globalIndex);
            }}
            onDrop={(e) => {
              // 外部からのドロップはバーに委譲
              const pathsJson = e.dataTransfer.getData("application/x-filer-paths");
              const isBookmarkDrag = e.dataTransfer.getData("application/x-bookmark-index") !== "";
              if (pathsJson && !isBookmarkDrag) {
                handleBarDrop(e);
                return;
              }
              handleDrop(e, globalIndex);
            }}
            onDragEnd={handleDragEnd}
            title={bookmark.path}
          >
            <Folder className="w-3 h-3 text-amber-500 shrink-0" />
            <span className="truncate">{bookmark.name}</span>
          </button>
        );
      })}

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
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {contextMenu.type === "bookmark" && contextMenu.id && (
            <>
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[#f0f0f0]"
                onClick={() => {
                  const bmId = contextMenu.id;
                  const bm = bookmarks.find((b) => b.id === bmId);
                  setContextMenu(null);
                  if (bm) {
                    // メニューが閉じた後にリネーム開始（DOMの更新を待つ）
                    requestAnimationFrame(() => {
                      setRenamingId(bm.id);
                      setRenamingType("bookmark");
                      setRenameValue(bm.name);
                    });
                  }
                }}
              >
                <Pencil className="w-3 h-3" />
                Rename
              </button>
              {/* フォルダに移動サブメニュー */}
              {folders.length > 0 && <div className="border-t border-[#e5e5e5] my-0.5" />}
              {folders.map((f) => (
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
          )}
          {contextMenu.type === "folder" && contextMenu.id && (
            <>
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[#f0f0f0]"
                onClick={() => {
                  const fId = contextMenu.id;
                  const f = folders.find((fo) => fo.id === fId);
                  setContextMenu(null);
                  if (f) {
                    requestAnimationFrame(() => {
                      setRenamingId(f.id);
                      setRenamingType("folder");
                      setRenameValue(f.name);
                    });
                  }
                }}
              >
                <Pencil className="w-3 h-3" />
                Rename folder
              </button>
              <div className="border-t border-[#e5e5e5] my-0.5" />
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[#f0f0f0] text-red-600"
                onClick={() => {
                  if (contextMenu.id) removeFolder(contextMenu.id);
                  setContextMenu(null);
                }}
              >
                <X className="w-3 h-3" />
                Remove folder
              </button>
            </>
          )}
          {contextMenu.type === "bar" && (
            <button
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[#f0f0f0]"
              onClick={() => {
                addFolder("New Folder");
                setContextMenu(null);
              }}
            >
              <FolderPlus className="w-3 h-3" />
              New bookmark folder
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** ブックマークフォルダアイテム（ドロップダウン付き） */
function BookmarkFolderItem({
  folder,
  isOpen,
  onToggle,
  onNavigate,
  currentPath,
  onContextMenu,
  renamingId,
  renameValue,
  renameInputRef,
  onSetRenameValue,
  onCommitRename,
  onCancelRename,
}: {
  folder: BookmarkFolder;
  isOpen: boolean;
  onToggle: () => void;
  onNavigate: (path: string) => void;
  currentPath: string;
  onContextMenu: (e: React.MouseEvent) => void;
  renamingId: string | null;
  renameValue: string;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  onSetRenameValue: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
}) {
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const folderBookmarks = bookmarks.filter((b) => b.folderId === folder.id);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({ left: rect.left, top: rect.bottom + 2 });
    }
  }, [isOpen]);

  // ドロップダウンをビューポート内にクランプ
  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
    const clamped = clampMenuPosition(dropdownPos.left, dropdownPos.top, rect.width, rect.height);
    dropdownRef.current.style.left = `${clamped.x}px`;
    dropdownRef.current.style.top = `${clamped.y}px`;
  }, [isOpen, dropdownPos]);

  const isRenaming = renamingId === folder.id;

  return (
    <div className="relative shrink-0">
      {isRenaming ? (
        <input
          ref={renameInputRef}
          className="h-5 px-2 text-xs bg-white border border-[#0078d4] rounded outline-none min-w-[60px] max-w-[120px]"
          value={renameValue}
          onChange={(e) => onSetRenameValue(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") onCommitRename();
            if (e.key === "Escape") onCancelRename();
          }}
        />
      ) : (
        <button
          ref={buttonRef}
          className={cn(
            "flex items-center gap-1 px-2.5 rounded text-[#555] hover:bg-[#e8e8e8] cursor-pointer transition-colors",
            isOpen && "bg-[#e8e8e8]",
          )}
          style={{ height: useSettingsStore.getState().bookmarkItemHeight }}
          onClick={onToggle}
          onContextMenu={onContextMenu}
        >
          <Folder className="w-3 h-3 text-amber-500 shrink-0" />
          <span className="truncate max-w-[100px]">{folder.name}</span>
          <ChevronDown
            className={cn("w-2.5 h-2.5 text-[#999] transition-transform", isOpen && "rotate-180")}
          />
          {folderBookmarks.length > 0 && (
            <span className="text-[9px] text-[#999] ml-0.5">({folderBookmarks.length})</span>
          )}
        </button>
      )}

      {/* ドロップダウン */}
      {isOpen && (
        <div
          ref={dropdownRef}
          data-bookmark-dropdown
          className="fixed bg-white border border-[#d0d0d0] rounded-md shadow-lg py-1 z-50 min-w-[160px] max-w-[240px] animate-fade-scale-in"
          style={{ left: dropdownPos.left, top: dropdownPos.top }}
        >
          {folderBookmarks.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[#bbb]">Empty folder</div>
          ) : (
            folderBookmarks.map((bm) => (
              <button
                key={bm.id}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-[#f0f0f0] transition-colors",
                  bm.path.toLowerCase() === currentPath.toLowerCase() && "bg-[#e8f0fe] font-medium",
                )}
                onClick={() => {
                  onNavigate(bm.path);
                }}
                title={bm.path}
              >
                <Folder className="w-3 h-3 text-amber-500 shrink-0" />
                <span className="truncate">{bm.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
