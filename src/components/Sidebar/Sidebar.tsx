import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { invoke } from "@tauri-apps/api/core";
import { resolveResource } from "@tauri-apps/api/path";
import {
  ChevronRight,
  Download,
  File,
  FileText,
  Folder,
  HardDrive,
  Home,
  Image,
  Layers,
  Monitor,
  Music,
  Pencil,
  Plus,
  Search,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearHighlight,
  findDropZone,
  handleNativeDrop,
  setHighlight,
} from "../../hooks/useNativeDrop";
import { useTranslation } from "../../i18n";
import { useIconStore } from "../../stores/iconStore";
import { useExplorerStore } from "../../stores/panelStore";
import { useSmartFolderStore } from "../../stores/smartFolderStore";
import type { DriveInfo } from "../../types";
import { cn } from "../../utils/cn";
import { clampMenuPosition } from "../../utils/menuPosition";

interface QuickAccessItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

function SidebarIcon({ ext, fallback }: { ext: string; fallback: React.ReactNode }) {
  const iconUrl = useIconStore((s) => s.icons[ext]);
  if (iconUrl) {
    return <img src={iconUrl} alt="" className="w-4 h-4 shrink-0" draggable={false} />;
  }
  return <>{fallback}</>;
}

export function Sidebar() {
  const t = useTranslation();
  const currentPath = useExplorerStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0];
    return tab.path;
  });
  const loadDirectory = useExplorerStore((s) => s.loadDirectory);
  const stackItems = useExplorerStore((s) => s.stackItems);
  const removeFromStack = useExplorerStore((s) => s.removeFromStack);
  const clearStack = useExplorerStore((s) => s.clearStack);
  const fetchIcons = useIconStore((s) => s.fetchIcons);
  const smartFolders = useSmartFolderStore((s) => s.smartFolders);
  const loadSmartFolders = useSmartFolderStore((s) => s.load);
  const openEditor = useSmartFolderStore((s) => s.openEditor);
  const removeSmartFolder = useSmartFolderStore((s) => s.remove);

  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [homeDir, setHomeDir] = useState("");
  const [quickAccessOpen, setQuickAccessOpen] = useState(true);
  const [pcOpen, setPcOpen] = useState(true);
  const [smartFolderOpen, setSmartFolderOpen] = useState(true);
  const [stackOpen, setStackOpen] = useState(true);
  const [sfContextMenu, setSfContextMenu] = useState<{
    x: number;
    y: number;
    folderId: number;
  } | null>(null);
  const sfContextMenuRef = useRef<HTMLDivElement>(null);
  const [sfMenuPos, setSfMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [stackSelected, setStackSelected] = useState<Set<string>>(new Set());
  const [stackLastClicked, setStackLastClicked] = useState<string | null>(null);
  const [stackContextMenu, setStackContextMenu] = useState<{
    x: number;
    y: number;
    path: string | null; // null = background context menu
  } | null>(null);
  const stackContextMenuRef = useRef<HTMLDivElement>(null);
  const [stackMenuPos, setStackMenuPos] = useState<{ x: number; y: number } | null>(null);

  // スタックアイテムが変わったら無効な選択を除去
  useEffect(() => {
    setStackSelected((prev) => {
      const valid = new Set([...prev].filter((p) => stackItems.includes(p)));
      return valid.size === prev.size ? prev : valid;
    });
  }, [stackItems]);

  // スタックアイテムクリック（Shift/Ctrl対応）
  const handleStackItemClick = useCallback(
    (e: React.MouseEvent, path: string) => {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl: トグル選択
        setStackSelected((prev) => {
          const next = new Set(prev);
          if (next.has(path)) next.delete(path);
          else next.add(path);
          return next;
        });
        setStackLastClicked(path);
      } else if (e.shiftKey && stackLastClicked) {
        // Shift: 範囲選択
        const from = stackItems.indexOf(stackLastClicked);
        const to = stackItems.indexOf(path);
        if (from >= 0 && to >= 0) {
          const start = Math.min(from, to);
          const end = Math.max(from, to);
          const range = stackItems.slice(start, end + 1);
          setStackSelected(new Set(range));
        }
      } else {
        // 通常クリック: 単一選択
        setStackSelected(new Set([path]));
        setStackLastClicked(path);
      }
    },
    [stackItems, stackLastClicked],
  );

  useEffect(() => {
    invoke<DriveInfo[]>("get_drives").then(setDrives);
    invoke<string>("get_home_dir").then(setHomeDir);
    loadSmartFolders();
  }, [loadSmartFolders]);

  // スマートフォルダコンテキストメニュー閉じる
  useEffect(() => {
    if (!sfContextMenu) return;
    const handleClick = () => setSfContextMenu(null);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSfContextMenu(null);
    };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [sfContextMenu]);

  // スマートフォルダコンテキストメニューをビューポート内にクランプ
  useEffect(() => {
    if (!sfContextMenu || !sfContextMenuRef.current) return;
    const rect = sfContextMenuRef.current.getBoundingClientRect();
    const clamped = clampMenuPosition(sfContextMenu.x, sfContextMenu.y, rect.width, rect.height);
    setSfMenuPos(clamped);
    return () => setSfMenuPos(null);
  }, [sfContextMenu]);

  // サイドバー用のアイコンを取得
  useEffect(() => {
    fetchIcons(["__directory__"]);
  }, [fetchIcons]);

  const quickAccess: QuickAccessItem[] = homeDir
    ? [
        {
          label: t.homeView.desktop,
          path: `${homeDir}\\Desktop`,
          icon: <Monitor className="w-4 h-4" />,
        },
        {
          label: t.homeView.documents,
          path: `${homeDir}\\Documents`,
          icon: <FileText className="w-4 h-4" />,
        },
        {
          label: t.homeView.downloads,
          path: `${homeDir}\\Downloads`,
          icon: <Download className="w-4 h-4" />,
        },
        {
          label: t.homeView.pictures,
          path: `${homeDir}\\Pictures`,
          icon: <Image className="w-4 h-4" />,
        },
        { label: t.homeView.music, path: `${homeDir}\\Music`, icon: <Music className="w-4 h-4" /> },
        {
          label: t.homeView.videos,
          path: `${homeDir}\\Videos`,
          icon: <Video className="w-4 h-4" />,
        },
      ]
    : [];

  const isActive = (path: string) =>
    currentPath.toLowerCase() === path.toLowerCase() ||
    currentPath.toLowerCase().startsWith(`${path.toLowerCase()}\\`);

  // ドラッグアイコンパス
  const dragIconRef = useRef<string>("");
  useEffect(() => {
    resolveResource("icons/32x32.png")
      .then((p) => {
        dragIconRef.current = p;
      })
      .catch(() => {});
  }, []);

  // Stack item context menu
  const handleStackItemContextMenu = useCallback((e: React.MouseEvent, path: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setStackContextMenu({ x: e.clientX, y: e.clientY, path });
  }, []);

  // Close context menu
  useEffect(() => {
    if (!stackContextMenu) return;
    const handleClick = () => setStackContextMenu(null);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStackContextMenu(null);
    };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [stackContextMenu]);

  // スタックコンテキストメニューをビューポート内にクランプ（state管理）
  useEffect(() => {
    if (!stackContextMenu || !stackContextMenuRef.current) return;
    const rect = stackContextMenuRef.current.getBoundingClientRect();
    const clamped = clampMenuPosition(
      stackContextMenu.x,
      stackContextMenu.y,
      rect.width,
      rect.height,
    );
    setStackMenuPos(clamped);
    return () => setStackMenuPos(null);
  }, [stackContextMenu]);

  // Get file name from path
  const getFileName = (path: string) => {
    const parts = path.split("\\");
    return parts[parts.length - 1] || path;
  };

  // Get extension from path
  const getExtension = (path: string) => {
    const name = getFileName(path);
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.substring(dot + 1).toLowerCase() : "";
  };

  // Check if path is a directory (simple heuristic: no extension)
  const isLikelyDir = (path: string) => {
    const name = getFileName(path);
    return !name.includes(".");
  };

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto overflow-x-hidden py-1 text-[13px]">
      {/* ホーム */}
      <button
        className={cn(
          "flex items-center gap-2 px-2 py-1 hover:bg-[var(--chrome-hover)] text-left w-full font-semibold transition-colors duration-100",
          currentPath === "home:" && "bg-[var(--chrome-active)]",
        )}
        onClick={() => loadDirectory("home:")}
      >
        <Home className="w-4 h-4" />
        {t.sidebar.home}
      </button>

      {/* クイックアクセス */}
      <button
        className="flex items-center gap-1 px-2 py-1 hover:bg-[var(--chrome-hover)] text-left w-full font-semibold transition-colors duration-100"
        onClick={() => setQuickAccessOpen(!quickAccessOpen)}
      >
        <ChevronRight
          className={cn(
            "w-3 h-3 transition-transform duration-200",
            quickAccessOpen && "rotate-90",
          )}
        />
        {t.sidebar.quickAccess}
      </button>
      {quickAccessOpen &&
        quickAccess.map((item) => (
          <button
            key={item.path}
            className={cn(
              "flex items-center gap-2 pl-6 pr-2 py-[3px] hover:bg-[var(--chrome-hover)] text-left w-full min-w-0 transition-colors duration-100",
              isActive(item.path) && "bg-[var(--chrome-active)]",
            )}
            onClick={() => loadDirectory(item.path)}
            data-mid-click-path={item.path}
            title={item.path}
          >
            <span className="text-[var(--chrome-text-dim)] shrink-0">
              <SidebarIcon ext="__directory__" fallback={item.icon} />
            </span>
            <span className="truncate">{item.label}</span>
          </button>
        ))}

      {/* PC */}
      <button
        className="flex items-center gap-1 px-2 py-1 mt-2 hover:bg-[var(--chrome-hover)] text-left w-full font-semibold transition-colors duration-100"
        onClick={() => setPcOpen(!pcOpen)}
      >
        <ChevronRight
          className={cn("w-3 h-3 transition-transform duration-200", pcOpen && "rotate-90")}
        />
        {t.sidebar.thisPC}
      </button>
      {pcOpen &&
        drives.map((drive) => (
          <button
            key={drive.path}
            className={cn(
              "flex items-center gap-2 pl-6 pr-2 py-[3px] hover:bg-[var(--chrome-hover)] text-left w-full min-w-0 transition-colors duration-100",
              isActive(drive.path) && "bg-[var(--chrome-active)]",
            )}
            onClick={() => loadDirectory(drive.path)}
            data-mid-click-path={drive.path}
            title={drive.path}
          >
            {drive.icon ? (
              <img src={drive.icon} alt="" className="w-4 h-4 shrink-0" draggable={false} />
            ) : (
              <HardDrive className="w-4 h-4 text-[var(--chrome-text-dim)] shrink-0" />
            )}
            <span className="truncate">{drive.display_name}</span>
          </button>
        ))}

      {/* スマートフォルダ */}
      <button
        className="flex items-center gap-1 px-2 py-1 mt-2 hover:bg-[var(--chrome-hover)] text-left w-full font-semibold transition-colors duration-100"
        onClick={() => setSmartFolderOpen(!smartFolderOpen)}
      >
        <ChevronRight
          className={cn(
            "w-3 h-3 transition-transform duration-200",
            smartFolderOpen && "rotate-90",
          )}
        />
        <Search className="w-3.5 h-3.5 mr-0.5" />
        {t.sidebar.smartFolders}
        <span
          className="ml-auto p-0.5 rounded hover:bg-[var(--chrome-active)] transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            openEditor();
          }}
          title={t.smartFolder.create}
        >
          <Plus className="w-3 h-3" />
        </span>
      </button>
      {smartFolderOpen && (
        <div>
          {smartFolders.length === 0 ? (
            <div className="flex items-center justify-center py-2 text-[11px] text-[var(--chrome-text-dim)] italic">
              {t.smartFolder.empty}
            </div>
          ) : (
            smartFolders.map((sf) => (
              <button
                key={sf.id}
                className={cn(
                  "flex items-center gap-2 pl-6 pr-2 py-[3px] hover:bg-[var(--chrome-hover)] text-left w-full min-w-0 transition-colors duration-100",
                  currentPath === `smart-folder:${sf.id}` && "bg-[var(--chrome-active)]",
                )}
                onClick={() => loadDirectory(`smart-folder:${sf.id}`)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSfContextMenu({ x: e.clientX, y: e.clientY, folderId: sf.id });
                }}
                title={sf.name}
              >
                <Search className="w-4 h-4 text-[var(--accent)] shrink-0" />
                <span className="truncate">{sf.name}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Stack */}
      <button
        className="flex items-center gap-1 px-2 py-1 mt-2 hover:bg-[var(--chrome-hover)] text-left w-full font-semibold transition-colors duration-100"
        onClick={() => setStackOpen(!stackOpen)}
      >
        <ChevronRight
          className={cn("w-3 h-3 transition-transform duration-200", stackOpen && "rotate-90")}
        />
        <Layers className="w-3.5 h-3.5 mr-0.5" />
        {t.sidebar.stack}
        {stackItems.length > 0 && (
          <span
            className="ml-auto text-[10px] bg-[var(--accent)] text-white rounded-full px-1.5 min-w-[18px] text-center hover:bg-[#c42b1c] cursor-pointer transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              clearStack();
            }}
            title={t.sidebar.clearStack}
          >
            {stackItems.length}
          </span>
        )}
      </button>
      {stackOpen && (
        <div
          className="min-h-[40px] transition-colors border-b border-[var(--chrome-border)]"
          data-drop-zone="sidebar-stack"
          onClick={(e) => {
            // 背景クリックで選択解除（アイテムクリックはstopPropagation不要、e.targetで判定）
            if (e.target === e.currentTarget) setStackSelected(new Set());
          }}
          onContextMenu={(e) => handleStackItemContextMenu(e, null)}
        >
          {stackItems.length === 0 ? (
            <div className="flex items-center justify-center h-10 text-[11px] text-[var(--chrome-text-dim)] italic">
              {t.sidebar.dragFilesHere}
            </div>
          ) : (
            stackItems.map((path) => {
              const isDir = isLikelyDir(path);
              const ext = isDir ? "__directory__" : getExtension(path);
              const isItemSelected = stackSelected.has(path);
              return (
                <div
                  key={path}
                  className={cn(
                    "flex items-center gap-2 pl-6 pr-1 py-[3px] text-left w-full group cursor-grab active:cursor-grabbing transition-colors duration-100",
                    isItemSelected ? "bg-[var(--chrome-active)]" : "hover:bg-[var(--chrome-hover)]",
                  )}
                  title={path}
                  onClick={(e) => handleStackItemClick(e, path)}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    const startX = e.clientX;
                    const startY = e.clientY;
                    let mode: "idle" | "custom" | "native" = "idle";
                    const dragPaths =
                      isItemSelected && stackSelected.size > 1
                        ? stackItems.filter((p) => stackSelected.has(p))
                        : [path];

                    let ghostEl: HTMLDivElement | null = null;

                    const cleanupCustom = () => {
                      mode = "idle";
                      clearHighlight();
                      document.body.classList.remove("file-dragging");
                      if (ghostEl) {
                        ghostEl.remove();
                        ghostEl = null;
                      }
                    };

                    const onMove = (me: MouseEvent) => {
                      if (mode === "native") return;
                      if (mode === "idle") {
                        if (Math.abs(me.clientX - startX) < 5 && Math.abs(me.clientY - startY) < 5)
                          return;
                        // カスタムドラッグモード開始
                        mode = "custom";
                        document.body.classList.add("file-dragging");
                        // ゴースト作成
                        ghostEl = document.createElement("div");
                        ghostEl.className = "fixed z-[9999] pointer-events-none";
                        ghostEl.style.left = `${me.clientX + 12}px`;
                        ghostEl.style.top = `${me.clientY + 12}px`;
                        const name = dragPaths[0].substring(dragPaths[0].lastIndexOf("\\") + 1);
                        const inner = document.createElement("div");
                        inner.className =
                          "flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-[#d0d0d0] rounded-md shadow-md max-w-[180px] text-xs";
                        const span = document.createElement("span");
                        span.className = "truncate";
                        span.textContent = name;
                        inner.appendChild(span);
                        ghostEl.appendChild(inner);
                        if (dragPaths.length > 1) {
                          const badge = document.createElement("span");
                          badge.className =
                            "absolute -top-2 right-0 text-[11px] bg-[var(--accent)] text-white rounded-full px-1.5 min-w-[20px] text-center font-semibold leading-[18px] shadow-sm";
                          badge.textContent = `+${dragPaths.length}`;
                          ghostEl.appendChild(badge);
                        }
                        document.body.appendChild(ghostEl);
                        return;
                      }
                      // カスタムドラッグ中: ゴースト追従 + ハイライト
                      if (ghostEl) {
                        ghostEl.style.left = `${me.clientX + 12}px`;
                        ghostEl.style.top = `${me.clientY + 12}px`;
                      }
                      const zone = findDropZone(me.clientX, me.clientY);
                      setHighlight(zone);
                    };

                    const onUp = (me: MouseEvent) => {
                      window.removeEventListener("mousemove", onMove);
                      window.removeEventListener("mouseup", onUp);
                      document.documentElement.removeEventListener("mouseleave", onLeave);
                      if (mode === "custom") {
                        handleNativeDrop(dragPaths, me.clientX, me.clientY);
                        cleanupCustom();
                        // ドラッグ元がスタックなのでスタックから除去
                        useExplorerStore.getState().removeFromStack(dragPaths);
                      }
                    };

                    const onLeave = () => {
                      if (mode !== "custom") return;
                      cleanupCustom();
                      mode = "native";
                      window.removeEventListener("mousemove", onMove);
                      window.removeEventListener("mouseup", onUp);
                      document.documentElement.removeEventListener("mouseleave", onLeave);
                      startDrag({ item: dragPaths, icon: dragIconRef.current || "" }, (payload) => {
                        if (payload.result === "Dropped") {
                          useExplorerStore.getState().removeFromStack(dragPaths);
                          useExplorerStore.getState().refreshDirectory();
                        }
                      }).catch(() => {
                        // ネイティブドラッグ開始失敗は通知不要
                      });
                    };

                    window.addEventListener("mousemove", onMove);
                    window.addEventListener("mouseup", onUp);
                    document.documentElement.addEventListener("mouseleave", onLeave);
                  }}
                  onDoubleClick={() => {
                    const parent = path.substring(0, path.lastIndexOf("\\"));
                    if (parent) loadDirectory(parent);
                  }}
                  onContextMenu={(e) => handleStackItemContextMenu(e, path)}
                >
                  <SidebarIcon
                    ext={ext}
                    fallback={
                      isDir ? (
                        <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                      ) : (
                        <File className="w-4 h-4 text-[#666] shrink-0" />
                      )
                    }
                  />
                  <span className="truncate flex-1">{getFileName(path)}</span>
                  <button
                    className="p-0.5 rounded hover:bg-[var(--chrome-hover)] opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      // 選択中なら選択アイテム全部削除、そうでなければ単体削除
                      if (isItemSelected && stackSelected.size > 1) {
                        removeFromStack([...stackSelected]);
                        setStackSelected(new Set());
                      } else {
                        removeFromStack(path);
                      }
                    }}
                    title={t.sidebar.remove}
                  >
                    <X className="w-3 h-3 text-[var(--chrome-text-dim)]" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ゴミ箱ドロップゾーン */}
      <div className="mt-auto border-t border-[var(--chrome-border)]">
        <button
          className="flex items-center gap-2 px-3 py-2 w-full text-left text-[var(--chrome-text-dim)] hover:bg-[var(--chrome-hover)] transition-colors duration-150"
          data-drop-zone="sidebar-trash"
          onDoubleClick={() => invoke("open_recycle_bin")}
        >
          <Trash2 className="w-4 h-4 shrink-0" />
          <span className="text-[12px]">{t.sidebar.trash}</span>
        </button>
      </div>

      {/* Smart folder context menu */}
      {sfContextMenu && (
        <div
          ref={sfContextMenuRef}
          className="fixed z-50 min-w-40 bg-white border border-[#e0e0e0] rounded-lg shadow-lg py-1 animate-fade-scale-in origin-top-left"
          style={{
            left: sfMenuPos ? sfMenuPos.x : sfContextMenu.x,
            top: sfMenuPos ? sfMenuPos.y : sfContextMenu.y,
            visibility: sfMenuPos ? "visible" : "hidden",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="flex items-center gap-3 w-full px-3 py-1.5 text-sm text-left hover:bg-[var(--chrome-hover)] transition-colors"
            onClick={() => {
              const folder = smartFolders.find((sf) => sf.id === sfContextMenu.folderId);
              if (folder) openEditor(folder);
              setSfContextMenu(null);
            }}
          >
            <Pencil className="w-4 h-4 text-[var(--chrome-text-dim)]" />
            {t.common.edit}
          </button>
          <div className="h-px bg-[var(--chrome-border)] my-1" />
          <button
            className="flex items-center gap-3 w-full px-3 py-1.5 text-sm text-left hover:bg-[var(--chrome-hover)] text-red-500 transition-colors"
            onClick={() => {
              removeSmartFolder(sfContextMenu.folderId);
              setSfContextMenu(null);
            }}
          >
            <Trash2 className="w-4 h-4" />
            {t.common.delete}
          </button>
        </div>
      )}

      {/* Stack context menu */}
      {stackContextMenu && (
        <div
          ref={stackContextMenuRef}
          className="fixed z-50 min-w-40 bg-white border border-[#e0e0e0] rounded-lg shadow-lg py-1 animate-fade-scale-in origin-top-left"
          style={{
            left: stackMenuPos ? stackMenuPos.x : stackContextMenu.x,
            top: stackMenuPos ? stackMenuPos.y : stackContextMenu.y,
            visibility: stackMenuPos ? "visible" : "hidden",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {stackContextMenu.path && (
            <button
              className="flex items-center gap-3 w-full px-3 py-1.5 text-sm text-left hover:bg-[var(--chrome-hover)] transition-colors"
              onClick={() => {
                const target = stackContextMenu.path!;
                if (stackSelected.has(target) && stackSelected.size > 1) {
                  removeFromStack([...stackSelected]);
                  setStackSelected(new Set());
                } else {
                  removeFromStack(target);
                }
                setStackContextMenu(null);
              }}
            >
              <Trash2 className="w-4 h-4 text-[var(--chrome-text-dim)]" />
              {stackSelected.has(stackContextMenu.path) && stackSelected.size > 1
                ? `${t.sidebar.remove} (${stackSelected.size})`
                : t.sidebar.remove}
            </button>
          )}
          {stackContextMenu.path && <div className="h-px bg-[var(--chrome-border)] my-1" />}
          <button
            className="flex items-center gap-3 w-full px-3 py-1.5 text-sm text-left hover:bg-[var(--chrome-hover)] transition-colors"
            onClick={() => {
              clearStack();
              setStackContextMenu(null);
            }}
            disabled={stackItems.length === 0}
          >
            <Trash2 className="w-4 h-4 text-[var(--chrome-text-dim)]" />
            {t.sidebar.clearAll}
          </button>
        </div>
      )}
    </div>
  );
}
