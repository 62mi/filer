import { invoke } from "@tauri-apps/api/core";
import {
  ChevronRight,
  Download,
  File,
  FileText,
  Folder,
  HardDrive,
  Image,
  Layers,
  Monitor,
  Music,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n";
import { useIconStore } from "../../stores/iconStore";
import { useExplorerStore } from "../../stores/panelStore";
import type { DriveInfo } from "../../types";
import { cn } from "../../utils/cn";
import { clampMenuPosition } from "../../utils/menuPosition";
import { createDragGhost, removeDragGhost } from "../Panel/DragGhost";

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
  const addToStack = useExplorerStore((s) => s.addToStack);
  const removeFromStack = useExplorerStore((s) => s.removeFromStack);
  const clearStack = useExplorerStore((s) => s.clearStack);
  const fetchIcons = useIconStore((s) => s.fetchIcons);

  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [homeDir, setHomeDir] = useState("");
  const [quickAccessOpen, setQuickAccessOpen] = useState(true);
  const [pcOpen, setPcOpen] = useState(true);
  const [stackOpen, setStackOpen] = useState(true);
  const [stackDragOver, setStackDragOver] = useState(false);
  const [stackContextMenu, setStackContextMenu] = useState<{
    x: number;
    y: number;
    path: string | null; // null = background context menu
  } | null>(null);
  const stackContextMenuRef = useRef<HTMLDivElement>(null);
  const [stackMenuPos, setStackMenuPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    invoke<DriveInfo[]>("get_drives").then(setDrives);
    invoke<string>("get_home_dir").then(setHomeDir);
  }, []);

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

  // Stack D&D handlers
  const handleStackDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setStackDragOver(true);
  }, []);

  const handleStackDragLeave = useCallback(() => {
    setStackDragOver(false);
  }, []);

  const handleStackDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setStackDragOver(false);
      const pathsJson = e.dataTransfer.getData("application/x-filer-paths");
      if (!pathsJson) return;
      try {
        const paths: string[] = JSON.parse(pathsJson);
        addToStack(paths);
      } catch {
        // ignore
      }
    },
    [addToStack],
  );

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
    const clamped = clampMenuPosition(stackContextMenu.x, stackContextMenu.y, rect.width, rect.height);
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
      {/* クイックアクセス */}
      <button
        className="flex items-center gap-1 px-2 py-1 hover:bg-[#e8e8e8] text-left w-full font-semibold text-[#1a1a1a] transition-colors duration-100"
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
              "flex items-center gap-2 pl-6 pr-2 py-[3px] hover:bg-[#e8e8e8] text-left w-full truncate transition-colors duration-100",
              isActive(item.path) && "bg-[#e8e8e8]",
            )}
            onClick={() => loadDirectory(item.path)}
            title={item.path}
          >
            <span className="text-[#666] shrink-0">
              <SidebarIcon ext="__directory__" fallback={item.icon} />
            </span>
            <span className="truncate">{item.label}</span>
          </button>
        ))}

      {/* PC */}
      <button
        className="flex items-center gap-1 px-2 py-1 mt-2 hover:bg-[#e8e8e8] text-left w-full font-semibold text-[#1a1a1a] transition-colors duration-100"
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
              "flex items-center gap-2 pl-6 pr-2 py-[3px] hover:bg-[#e8e8e8] text-left w-full transition-colors duration-100",
              isActive(drive.path) && "bg-[#e8e8e8]",
            )}
            onClick={() => loadDirectory(drive.path)}
            title={drive.path}
          >
            {drive.icon ? (
              <img src={drive.icon} alt="" className="w-4 h-4 shrink-0" draggable={false} />
            ) : (
              <HardDrive className="w-4 h-4 text-[#666] shrink-0" />
            )}
            <span className="truncate">{drive.display_name}</span>
          </button>
        ))}

      {/* Stack */}
      <button
        className="flex items-center gap-1 px-2 py-1 mt-2 hover:bg-[#e8e8e8] text-left w-full font-semibold text-[#1a1a1a] transition-colors duration-100"
        onClick={() => setStackOpen(!stackOpen)}
      >
        <ChevronRight
          className={cn("w-3 h-3 transition-transform duration-200", stackOpen && "rotate-90")}
        />
        <Layers className="w-3.5 h-3.5 mr-0.5" />
        {t.sidebar.stack}
        {stackItems.length > 0 && (
          <span
            className="ml-auto text-[10px] bg-[#0078d4] text-white rounded-full px-1.5 min-w-[18px] text-center hover:bg-[#c42b1c] cursor-pointer transition-colors"
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
          className={cn(
            "min-h-[40px] transition-colors",
            stackDragOver &&
              "bg-[#cce8ff] outline outline-1 outline-[#0078d4] outline-offset-[-1px]",
          )}
          onDragOver={handleStackDragOver}
          onDragLeave={handleStackDragLeave}
          onDrop={handleStackDrop}
          onContextMenu={(e) => handleStackItemContextMenu(e, null)}
        >
          {stackItems.length === 0 ? (
            <div className="flex items-center justify-center h-10 text-[11px] text-[#999] italic">
              {t.sidebar.dragFilesHere}
            </div>
          ) : (
            stackItems.map((path) => {
              const isDir = isLikelyDir(path);
              const ext = isDir ? "__directory__" : getExtension(path);
              return (
                <div
                  key={path}
                  className="flex items-center gap-2 pl-6 pr-1 py-[3px] hover:bg-[#e8e8e8] text-left w-full group cursor-grab active:cursor-grabbing transition-colors duration-100"
                  title={path}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "copyMove";
                    e.dataTransfer.setData("application/x-filer-paths", JSON.stringify([path]));
                    e.dataTransfer.setData("application/x-filer-from-stack", "true");
                    const ghostItems = [
                      {
                        name: getFileName(path),
                        is_dir: isDir,
                      },
                    ];
                    const ghostCard = createDragGhost(ghostItems);
                    e.dataTransfer.setDragImage(ghostCard, 20, 16);
                  }}
                  onDragEnd={() => removeDragGhost()}
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
                    className="p-0.5 rounded hover:bg-[#d0d0d0] opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromStack(path);
                    }}
                    title={t.sidebar.remove}
                  >
                    <X className="w-3 h-3 text-[#999]" />
                  </button>
                </div>
              );
            })
          )}
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
              className="flex items-center gap-3 w-full px-3 py-1.5 text-sm text-left hover:bg-[#e8e8e8] transition-colors"
              onClick={() => {
                removeFromStack(stackContextMenu.path!);
                setStackContextMenu(null);
              }}
            >
              <Trash2 className="w-4 h-4 text-[#666]" />
              {t.sidebar.remove}
            </button>
          )}
          {stackContextMenu.path && <div className="h-px bg-[#e5e5e5] my-1" />}
          <button
            className="flex items-center gap-3 w-full px-3 py-1.5 text-sm text-left hover:bg-[#e8e8e8] transition-colors"
            onClick={() => {
              clearStack();
              setStackContextMenu(null);
            }}
            disabled={stackItems.length === 0}
          >
            <Trash2 className="w-4 h-4 text-[#666]" />
            {t.sidebar.clearAll}
          </button>
        </div>
      )}
    </div>
  );
}
