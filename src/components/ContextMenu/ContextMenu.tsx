import { invoke } from "@tauri-apps/api/core";
import {
  ChevronRight,
  ClipboardPaste,
  Copy,
  ExternalLink,
  FilePlus,
  Folder,
  FolderPlus,
  Info,
  Layers,
  LayoutTemplate,
  PencilLine,
  Scissors,
  Sparkles,
  Trash2,
  Wand2,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n";
import { useAiStore } from "../../stores/aiStore";
import { useExplorerStore } from "../../stores/panelStore";
import { useRuleStore } from "../../stores/ruleStore";
import { useRuleWizardStore } from "../../stores/ruleWizardStore";
import { useTemplateStore } from "../../stores/templateStore";
import { toast } from "../../stores/toastStore";
import { useUndoStore } from "../../stores/undoStore";
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
  submenu?: undefined;
}

interface MenuSeparator {
  separator: true;
}

interface SubmenuItem {
  label: string;
  icon: React.ReactNode;
  submenu: MenuItem[];
}

type MenuEntry = MenuItem | MenuSeparator | SubmenuItem;

export function ContextMenu({ x, y, onClose, targetIndex, onProperties }: ContextMenuProps) {
  const t = useTranslation();
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
  }, []);

  const items: MenuEntry[] = [
    ...(hasTarget
      ? [
          {
            label: t.contextMenu.open,
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
      label: t.contextMenu.copy,
      icon: <Copy className="w-4 h-4" />,
      onClick: () => {
        clipboardCopy();
        onClose();
      },
      disabled: !hasSelection,
    },
    {
      label: t.contextMenu.cut,
      icon: <Scissors className="w-4 h-4" />,
      onClick: () => {
        clipboardCut();
        onClose();
      },
      disabled: !hasSelection,
    },
    {
      label: t.contextMenu.paste,
      icon: <ClipboardPaste className="w-4 h-4" />,
      onClick: () => {
        clipboardPaste();
        onClose();
      },
      disabled: !clipboard,
    },
    { separator: true },
    {
      label: t.contextMenu.delete,
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
            label: t.contextMenu.rename,
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
            label: t.contextMenu.addToStack,
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
            label: `${t.contextMenu.pasteFromStackMove} (${stackItems.length})`,
            icon: <Scissors className="w-4 h-4" />,
            onClick: () => {
              pasteFromStack("move");
              onClose();
            },
          } as MenuItem,
          {
            label: `${t.contextMenu.pasteFromStackCopy} (${stackItems.length})`,
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
      label: t.contextMenu.folderRules,
      icon: <Zap className="w-4 h-4" />,
      onClick: () => {
        useRuleStore.getState().openDialog(tab.path);
        onClose();
      },
    },
    {
      label: t.contextMenu.aiRuleWizard,
      icon: <Wand2 className="w-4 h-4" />,
      onClick: () => {
        useRuleWizardStore.getState().openWizard(tab.path);
        onClose();
      },
    },
    {
      label: t.contextMenu.aiAutoOrganize,
      icon: <Sparkles className="w-4 h-4" />,
      onClick: () => {
        useAiStore.getState().openDialog(tab.path, tab.id);
        onClose();
      },
    },
    {
      label: t.contextMenu.newFolder,
      icon: <FolderPlus className="w-4 h-4" />,
      onClick: () => {
        createNewFolder();
        onClose();
      },
    },
    {
      label: t.contextMenu.newFile,
      icon: <FilePlus className="w-4 h-4" />,
      onClick: () => {
        createNewFile();
        onClose();
      },
    },
    (() => {
      if (!useTemplateStore.getState().loaded) {
        useTemplateStore.getState().loadTemplates();
      }
      const templates = useTemplateStore.getState().templates;
      const submenuItems: MenuItem[] = templates.map((tmpl) => ({
        label: tmpl.name,
        icon: <Folder className="w-4 h-4 text-amber-500" />,
        onClick: async () => {
          try {
            const createdPaths: string[] = await invoke("create_from_template", {
              basePath: tab.path,
              nodes: tmpl.nodes,
            });
            if (createdPaths.length > 0) {
              useUndoStore.getState().pushAction({
                type: "create_dir",
                entries: createdPaths.map((p) => ({ sourcePath: "", destPath: p })),
              });
            }
            toast.success(`${t.panel.templateDeployed}: ${tmpl.name}`);
            useExplorerStore.getState().refreshDirectory();
          } catch (err: unknown) {
            toast.error(
              `${t.panel.templateDeployFailed}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          onClose();
        },
      }));
      // 常に末尾に Template Manager を追加
      submenuItems.push({
        label: t.contextMenu.templateManager,
        icon: <LayoutTemplate className="w-4 h-4" />,
        onClick: () => {
          useTemplateStore.getState().openDialog();
          onClose();
        },
      });
      return {
        label: t.contextMenu.createFromTemplate,
        icon: <LayoutTemplate className="w-4 h-4" />,
        submenu: submenuItems,
      } as SubmenuItem;
    })(),
    ...(hasTarget
      ? [
          { separator: true as const },
          {
            label: t.contextMenu.properties,
            icon: <Info className="w-4 h-4" />,
            onClick: () => {
              onProperties(entries[targetIndex!]);
            },
          } as MenuItem,
        ]
      : []),
  ];

  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);
  const submenuTimeoutRef = useRef<number | null>(null);

  const handleSubmenuEnter = (index: number) => {
    if (submenuTimeoutRef.current) clearTimeout(submenuTimeoutRef.current);
    setOpenSubmenu(index);
  };

  const handleSubmenuLeave = () => {
    submenuTimeoutRef.current = window.setTimeout(() => {
      setOpenSubmenu(null);
    }, 150);
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-48 bg-white border border-[#e0e0e0] rounded-lg shadow-lg py-1 animate-fade-scale-in origin-top-left"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => {
        if ("separator" in item && item.separator) {
          return <div key={i} className="h-px bg-[#e5e5e5] my-1" />;
        }
        // サブメニュー
        if ("submenu" in item && item.submenu) {
          const sub = item as SubmenuItem;
          return (
            <div
              key={i}
              className="relative"
              onMouseEnter={() => handleSubmenuEnter(i)}
              onMouseLeave={handleSubmenuLeave}
            >
              <div className="flex items-center gap-3 w-full px-3 py-1.5 text-sm text-left hover:bg-[#e8e8e8] transition-colors cursor-default">
                <span className="text-[#666]">{sub.icon}</span>
                <span className="flex-1">{sub.label}</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#999]" />
              </div>
              {openSubmenu === i && (
                <div
                  className="absolute left-full top-0 ml-0.5 min-w-44 bg-white border border-[#e0e0e0] rounded-lg shadow-lg py-1 z-50"
                  onMouseEnter={() => handleSubmenuEnter(i)}
                  onMouseLeave={handleSubmenuLeave}
                >
                  {sub.submenu.map((subItem, j) => (
                    <button
                      key={j}
                      className="flex items-center gap-3 w-full px-3 py-1.5 text-sm text-left hover:bg-[#e8e8e8] transition-colors"
                      onClick={subItem.onClick}
                    >
                      <span className="text-[#666]">{subItem.icon}</span>
                      {subItem.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
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
