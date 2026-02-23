import { invoke } from "@tauri-apps/api/core";
import {
  ClipboardPaste,
  Copy,
  ExternalLink,
  FilePlus,
  FolderPlus,
  Info,
  Layers,
  PencilLine,
  Scissors,
  Trash2,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { useExplorerStore } from "../../stores/panelStore";
import type { FileEntry } from "../../types";

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  targetIndex: number | null;
  onProperties: (entry: FileEntry) => void;
}

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  separator?: false;
}

interface MenuSeparator {
  separator: true;
}

type MenuEntry = MenuItem | MenuSeparator;

export function ContextMenu({ x, y, onClose, targetIndex, onProperties }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const tab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0]);
  const clipboard = useExplorerStore((s) => s.clipboard);
  const clipboardCopy = useExplorerStore((s) => s.clipboardCopy);
  const clipboardCut = useExplorerStore((s) => s.clipboardCut);
  const clipboardPaste = useExplorerStore((s) => s.clipboardPaste);
  const deleteSelected = useExplorerStore((s) => s.deleteSelected);
  const startRename = useExplorerStore((s) => s.startRename);
  const createNewFolder = useExplorerStore((s) => s.createNewFolder);
  const createNewFile = useExplorerStore((s) => s.createNewFile);
  const addToStack = useExplorerStore((s) => s.addToStack);
  const pasteFromStack = useExplorerStore((s) => s.pasteFromStack);
  const stackItems = useExplorerStore((s) => s.stackItems);

  const entries = tab.entries;
  const selectedIndices = tab.selectedIndices;

  const hasTarget = targetIndex !== null && entries[targetIndex];
  const hasSelection = selectedIndices.size > 0 || hasTarget;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menuRef.current.style.left = `${window.innerWidth - rect.width - 4}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menuRef.current.style.top = `${window.innerHeight - rect.height - 4}px`;
    }
  }, [x, y]);

  const items: MenuEntry[] = [
    ...(hasTarget
      ? [
          {
            label: "Open",
            icon: <ExternalLink className="w-4 h-4" />,
            onClick: () => {
              const entry = entries[targetIndex!];
              if (entry.is_dir) {
                useExplorerStore.getState().loadDirectory(entry.path);
              } else {
                invoke("open_in_default_app", { path: entry.path });
              }
              onClose();
            },
          } as MenuItem,
        ]
      : []),
    ...(hasTarget ? [{ separator: true as const }] : []),
    {
      label: "Copy",
      icon: <Copy className="w-4 h-4" />,
      onClick: () => {
        clipboardCopy();
        onClose();
      },
      disabled: !hasSelection,
    },
    {
      label: "Cut",
      icon: <Scissors className="w-4 h-4" />,
      onClick: () => {
        clipboardCut();
        onClose();
      },
      disabled: !hasSelection,
    },
    {
      label: "Paste",
      icon: <ClipboardPaste className="w-4 h-4" />,
      onClick: () => {
        clipboardPaste();
        onClose();
      },
      disabled: !clipboard,
    },
    { separator: true },
    {
      label: "Delete",
      icon: <Trash2 className="w-4 h-4" />,
      onClick: () => {
        deleteSelected();
        onClose();
      },
      disabled: !hasSelection,
    },
    ...(hasTarget
      ? [
          {
            label: "Rename",
            icon: <PencilLine className="w-4 h-4" />,
            onClick: () => {
              startRename(targetIndex!);
              onClose();
            },
          } as MenuItem,
        ]
      : []),
    ...(hasSelection
      ? [
          {
            label: "Add to Stack",
            icon: <Layers className="w-4 h-4" />,
            onClick: () => {
              const indices =
                selectedIndices.size > 0
                  ? Array.from(selectedIndices)
                  : targetIndex !== null
                    ? [targetIndex]
                    : [];
              const paths = indices.map((i) => entries[i]?.path).filter(Boolean);
              if (paths.length > 0) addToStack(paths);
              onClose();
            },
          } as MenuItem,
        ]
      : []),
    ...(stackItems.length > 0
      ? [
          {
            label: `Paste from Stack (Move ${stackItems.length})`,
            icon: <Scissors className="w-4 h-4" />,
            onClick: () => {
              pasteFromStack("move");
              onClose();
            },
          } as MenuItem,
          {
            label: `Paste from Stack (Copy ${stackItems.length})`,
            icon: <Copy className="w-4 h-4" />,
            onClick: () => {
              pasteFromStack("copy");
              onClose();
            },
          } as MenuItem,
        ]
      : []),
    { separator: true },
    {
      label: "New Folder",
      icon: <FolderPlus className="w-4 h-4" />,
      onClick: () => {
        createNewFolder();
        onClose();
      },
    },
    {
      label: "New File",
      icon: <FilePlus className="w-4 h-4" />,
      onClick: () => {
        createNewFile();
        onClose();
      },
    },
    ...(hasTarget
      ? [
          { separator: true as const },
          {
            label: "Properties",
            icon: <Info className="w-4 h-4" />,
            onClick: () => {
              onProperties(entries[targetIndex!]);
            },
          } as MenuItem,
        ]
      : []),
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-48 bg-white border border-[#e0e0e0] rounded-lg shadow-lg py-1"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => {
        if ("separator" in item && item.separator) {
          return <div key={i} className="h-px bg-[#e5e5e5] my-1" />;
        }
        const menuItem = item as MenuItem;
        return (
          <button
            key={i}
            className="flex items-center gap-3 w-full px-3 py-1.5 text-sm text-left hover:bg-[#e8e8e8] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            onClick={menuItem.onClick}
            disabled={menuItem.disabled}
          >
            <span className="text-[#666]">{menuItem.icon}</span>
            {menuItem.label}
          </button>
        );
      })}
    </div>
  );
}
