import { invoke } from "@tauri-apps/api/core";
import {
  ChevronDown,
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
import { useCallback, useEffect, useState } from "react";
import { useExplorerStore } from "../../stores/panelStore";
import type { DriveInfo } from "../../types";
import { cn } from "../../utils/cn";

interface QuickAccessItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

export function Sidebar() {
  const currentPath = useExplorerStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0];
    return tab.path;
  });
  const loadDirectory = useExplorerStore((s) => s.loadDirectory);
  const stackItems = useExplorerStore((s) => s.stackItems);
  const addToStack = useExplorerStore((s) => s.addToStack);
  const removeFromStack = useExplorerStore((s) => s.removeFromStack);
  const clearStack = useExplorerStore((s) => s.clearStack);

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

  useEffect(() => {
    invoke<DriveInfo[]>("get_drives").then(setDrives);
    invoke<string>("get_home_dir").then(setHomeDir);
  }, []);

  const quickAccess: QuickAccessItem[] = homeDir
    ? [
        { label: "Desktop", path: `${homeDir}\\Desktop`, icon: <Monitor className="w-4 h-4" /> },
        {
          label: "Documents",
          path: `${homeDir}\\Documents`,
          icon: <FileText className="w-4 h-4" />,
        },
        {
          label: "Downloads",
          path: `${homeDir}\\Downloads`,
          icon: <Download className="w-4 h-4" />,
        },
        { label: "Pictures", path: `${homeDir}\\Pictures`, icon: <Image className="w-4 h-4" /> },
        { label: "Music", path: `${homeDir}\\Music`, icon: <Music className="w-4 h-4" /> },
        { label: "Videos", path: `${homeDir}\\Videos`, icon: <Video className="w-4 h-4" /> },
      ]
    : [];

  const isActive = (path: string) =>
    currentPath.toLowerCase() === path.toLowerCase() ||
    currentPath.toLowerCase().startsWith(path.toLowerCase() + "\\");

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

  // Get file name from path
  const getFileName = (path: string) => {
    const parts = path.split("\\");
    return parts[parts.length - 1] || path;
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
        className="flex items-center gap-1 px-2 py-1 hover:bg-[#e8e8e8] text-left w-full font-semibold text-[#1a1a1a]"
        onClick={() => setQuickAccessOpen(!quickAccessOpen)}
      >
        {quickAccessOpen ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        Quick access
      </button>
      {quickAccessOpen &&
        quickAccess.map((item) => (
          <button
            key={item.path}
            className={cn(
              "flex items-center gap-2 pl-6 pr-2 py-[3px] hover:bg-[#e8e8e8] text-left w-full truncate",
              isActive(item.path) && "bg-[#e8e8e8]",
            )}
            onClick={() => loadDirectory(item.path)}
            title={item.path}
          >
            <span className="text-[#666] shrink-0">{item.icon}</span>
            <span className="truncate">{item.label}</span>
          </button>
        ))}

      {/* PC */}
      <button
        className="flex items-center gap-1 px-2 py-1 mt-2 hover:bg-[#e8e8e8] text-left w-full font-semibold text-[#1a1a1a]"
        onClick={() => setPcOpen(!pcOpen)}
      >
        {pcOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        This PC
      </button>
      {pcOpen &&
        drives.map((drive) => (
          <button
            key={drive.path}
            className={cn(
              "flex items-center gap-2 pl-6 pr-2 py-[3px] hover:bg-[#e8e8e8] text-left w-full",
              isActive(drive.path) && "bg-[#e8e8e8]",
            )}
            onClick={() => loadDirectory(drive.path)}
            title={drive.path}
          >
            <HardDrive className="w-4 h-4 text-[#666] shrink-0" />
            <span>Local Disk ({drive.name})</span>
          </button>
        ))}

      {/* Stack */}
      <button
        className="flex items-center gap-1 px-2 py-1 mt-2 hover:bg-[#e8e8e8] text-left w-full font-semibold text-[#1a1a1a]"
        onClick={() => setStackOpen(!stackOpen)}
      >
        {stackOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Layers className="w-3.5 h-3.5 mr-0.5" />
        Stack
        {stackItems.length > 0 && (
          <span
            className="ml-auto text-[10px] bg-[#0078d4] text-white rounded-full px-1.5 min-w-[18px] text-center hover:bg-[#c42b1c] cursor-pointer transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              clearStack();
            }}
            title="Clear stack"
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
              Drag files here
            </div>
          ) : (
            stackItems.map((path) => (
              <div
                key={path}
                className="flex items-center gap-2 pl-6 pr-1 py-[3px] hover:bg-[#e8e8e8] text-left w-full group cursor-grab active:cursor-grabbing"
                title={path}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "copyMove";
                  e.dataTransfer.setData("application/x-filer-paths", JSON.stringify(stackItems));
                  e.dataTransfer.setData("application/x-filer-from-stack", "true");
                }}
                onDoubleClick={() => {
                  // ファイルの親ディレクトリに移動
                  const parent = path.substring(0, path.lastIndexOf("\\"));
                  if (parent) loadDirectory(parent);
                }}
                onContextMenu={(e) => handleStackItemContextMenu(e, path)}
              >
                {isLikelyDir(path) ? (
                  <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                ) : (
                  <File className="w-4 h-4 text-[#666] shrink-0" />
                )}
                <span className="truncate flex-1">{getFileName(path)}</span>
                <button
                  className="p-0.5 rounded hover:bg-[#d0d0d0] opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromStack(path);
                  }}
                  title="Remove"
                >
                  <X className="w-3 h-3 text-[#999]" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Stack context menu */}
      {stackContextMenu && (
        <div
          className="fixed z-50 min-w-40 bg-white border border-[#e0e0e0] rounded-lg shadow-lg py-1"
          style={{ left: stackContextMenu.x, top: stackContextMenu.y }}
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
              Remove
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
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
