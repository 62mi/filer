import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Eye,
  EyeOff,
  FileText,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
  Search,
  Star,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n";
import { useBookmarkStore } from "../../stores/bookmarkStore";
import { useExplorerStore } from "../../stores/panelStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSmartFolderStore } from "../../stores/smartFolderStore";
import { toast } from "../../stores/toastStore";
import { cn } from "../../utils/cn";
import { formatPath } from "../../utils/format";

interface NavigationBarProps {
  previewOpen: boolean;
  onTogglePreview: () => void;
}

const TERMINAL_COMMANDS = new Set(["cmd", "powershell", "pwsh", "wt"]);

function NavButton({
  onClick,
  title,
  disabled,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className={cn(
        "p-2 rounded hover:bg-[#e8e8e8] transition-colors text-[#666]",
        disabled && "opacity-30 cursor-not-allowed hover:bg-transparent",
      )}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function NavigationBar({ previewOpen, onTogglePreview }: NavigationBarProps) {
  const t = useTranslation();
  const tab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0]);
  const showHidden = useExplorerStore((s) => s.showHidden);
  const navigateBack = useExplorerStore((s) => s.navigateBack);
  const navigateForward = useExplorerStore((s) => s.navigateForward);
  const navigateUp = useExplorerStore((s) => s.navigateUp);
  const loadDirectory = useExplorerStore((s) => s.loadDirectory);
  const toggleHidden = useExplorerStore((s) => s.toggleHidden);
  const searchFn = useExplorerStore((s) => s.search);
  const clearSearch = useExplorerStore((s) => s.clearSearch);
  const searchMode = useExplorerStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.searchMode || "name",
  );
  const setSearchMode = useExplorerStore((s) => s.setSearchMode);
  const searchContentFn = useExplorerStore((s) => s.searchContent);
  const clearContentSearch = useExplorerStore((s) => s.clearContentSearch);
  const pathStyle = useSettingsStore((s) => s.pathStyle);
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const addBookmark = useBookmarkStore((s) => s.addBookmark);
  const removeBookmark = useBookmarkStore((s) => s.removeBookmark);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(tab.path);
  const [searchValue, setSearchValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // ブックマーク済みチェック
  const currentBookmark = bookmarks.find((b) => b.path.toLowerCase() === tab.path.toLowerCase());
  const isBookmarked = !!currentBookmark;

  useEffect(() => {
    setEditValue(formatPath(tab.path, pathStyle));
    setSearchValue("");
  }, [tab.path, pathStyle]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSubmit = async () => {
    setEditing(false);
    const value = editValue.trim().toLowerCase();

    if (TERMINAL_COMMANDS.has(value)) {
      try {
        await invoke("open_terminal", { terminal: value, cwd: tab.path });
      } catch (err: unknown) {
        toast.error(
          `${t.navigationBar.terminalFailed}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      setEditValue(formatPath(tab.path, pathStyle));
      return;
    }

    if (editValue.trim() && editValue.trim() !== formatPath(tab.path, pathStyle)) {
      loadDirectory(editValue.trim());
    }
  };

  const isHome = tab.path === "home:";
  const isSmartFolder = tab.path.startsWith("smart-folder:");
  const smartFolderName = useSmartFolderStore((s) => {
    if (!isSmartFolder) return "";
    const id = Number(tab.path.replace("smart-folder:", ""));
    return s.smartFolders.find((sf) => sf.id === id)?.name ?? t.sidebar.smartFolders;
  });
  const segments = tab.path.split(/[\\/]/).filter(Boolean);

  return (
    <div className="flex items-center gap-1 h-[50px] px-2 bg-white border-b border-[#e5e5e5] shrink-0">
      {/* Navigation buttons */}
      <NavButton onClick={navigateBack} title="Back (Alt+Left)" disabled={tab.historyIndex <= 0}>
        <ArrowLeft className="w-4 h-4" />
      </NavButton>
      <NavButton
        onClick={navigateForward}
        title="Forward (Alt+Right)"
        disabled={tab.historyIndex >= tab.history.length - 1}
      >
        <ArrowRight className="w-4 h-4" />
      </NavButton>
      <NavButton onClick={navigateUp} title="Up (Alt+Up)" disabled={isHome || isSmartFolder}>
        <ArrowUp className="w-4 h-4" />
      </NavButton>
      <NavButton
        onClick={() => loadDirectory(tab.path, false)}
        title="Refresh (F5)"
        disabled={isHome}
      >
        <RotateCw className="w-3.5 h-3.5" />
      </NavButton>

      {/* Address bar */}
      <div className="flex-1 mx-1">
        {editing ? (
          <div className="flex items-center h-9 bg-white border border-[var(--accent)] rounded overflow-hidden">
            <input
              ref={inputRef}
              className="flex-1 h-full px-2 text-sm text-[#1a1a1a] outline-none min-w-0"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
                if (e.key === "Escape") {
                  setEditValue(formatPath(tab.path, pathStyle));
                  setEditing(false);
                }
              }}
            />
            {/* 星ボタン（編集中も表示） */}
            <button
              className={cn(
                "p-1 mr-0.5 rounded transition-all duration-150 shrink-0",
                isBookmarked
                  ? "text-amber-400 hover:text-amber-500"
                  : "text-[#ccc] hover:text-[#999]",
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (isBookmarked && currentBookmark) {
                  removeBookmark(currentBookmark.id);
                } else {
                  addBookmark(tab.path);
                }
              }}
              title={isBookmarked ? "Remove bookmark" : "Bookmark this location"}
            >
              <Star className="w-3.5 h-3.5" fill={isBookmarked ? "currentColor" : "none"} />
            </button>
          </div>
        ) : (
          <div
            className="flex items-center h-9 px-2 text-sm bg-[#f0f0f0] rounded cursor-text hover:bg-[#e8e8e8] overflow-hidden transition-colors duration-100 group"
            onClick={() => setEditing(true)}
          >
            <div className="flex items-center flex-1 min-w-0 overflow-hidden">
              {isHome ? (
                <span className="text-[#666]">{t.sidebar.home}</span>
              ) : isSmartFolder ? (
                <span className="flex items-center gap-1.5 text-[#666]">
                  <Search className="w-3.5 h-3.5 text-[var(--accent)]" />
                  {smartFolderName}
                </span>
              ) : (
                segments.map((segment, i) => {
                  const segmentPath = segments.slice(0, i + 1).join("\\");
                  const fullPath =
                    segmentPath.length === 2 && segmentPath[1] === ":"
                      ? `${segmentPath}\\`
                      : segmentPath;
                  return (
                    <span key={fullPath} className="flex items-center shrink-0">
                      {i > 0 && <span className="mx-1 text-[#999] text-xs">{"\u203A"}</span>}
                      <button
                        className="hover:text-[var(--accent)] hover:underline transition-colors"
                        data-mid-click-path={fullPath}
                        onClick={(e) => {
                          e.stopPropagation();
                          loadDirectory(fullPath);
                        }}
                      >
                        {segment}
                      </button>
                    </span>
                  );
                })
              )}
            </div>
            {/* Chrome風 星ボタン（アドレスバー右端） */}
            <button
              className={cn(
                "p-1 ml-1 rounded transition-all duration-150 shrink-0",
                isBookmarked
                  ? "text-amber-400 hover:text-amber-500 scale-100"
                  : "text-[#ccc] hover:text-[#999] opacity-0 group-hover:opacity-100",
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (isBookmarked && currentBookmark) {
                  removeBookmark(currentBookmark.id);
                } else {
                  addBookmark(tab.path);
                }
              }}
              title={isBookmarked ? "Remove bookmark" : "Bookmark this location"}
            >
              <Star className="w-3.5 h-3.5" fill={isBookmarked ? "currentColor" : "none"} />
            </button>
          </div>
        )}
      </div>

      {/* Hidden files toggle */}
      <NavButton onClick={toggleHidden} title="Toggle hidden files (Ctrl+H)">
        {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-[#999]" />}
      </NavButton>

      {/* Preview panel toggle */}
      <NavButton onClick={onTogglePreview} title={t.statusBar.togglePreview}>
        {previewOpen ? (
          <PanelRightClose className="w-4 h-4" />
        ) : (
          <PanelRightOpen className="w-4 h-4 text-[#999]" />
        )}
      </NavButton>

      {/* Search bar */}
      <div className="flex items-center h-9 w-60 bg-[#f0f0f0] rounded text-sm focus-within:bg-white focus-within:border focus-within:border-[var(--accent)] transition-all duration-150">
        {/* モード切替ボタン */}
        <button
          className={cn(
            "flex items-center justify-center h-full px-2 rounded-l transition-colors shrink-0",
            "hover:bg-[#e0e0e0]",
          )}
          onClick={() => {
            const newMode = searchMode === "name" ? "content" : "name";
            setSearchMode(newMode);
            setSearchValue("");
          }}
          title={
            searchMode === "name" ? t.navigationBar.searchByContent : t.navigationBar.searchByName
          }
        >
          {searchMode === "name" ? (
            <Search className="w-3.5 h-3.5 text-[#999]" />
          ) : (
            <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />
          )}
        </button>
        <input
          ref={searchRef}
          className="flex-1 bg-transparent outline-none text-[#1a1a1a] placeholder-[#999] min-w-0"
          placeholder={
            searchMode === "name"
              ? `Search ${tab.path.split(/[\\/]/).filter(Boolean).pop() || ""}`
              : t.navigationBar.searchByContent
          }
          value={searchValue}
          onChange={(e) => {
            setSearchValue(e.target.value);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            const val = e.target.value;
            debounceRef.current = setTimeout(
              () => {
                if (val.trim()) {
                  if (searchMode === "name") {
                    searchFn(val);
                  } else {
                    searchContentFn(val);
                  }
                } else {
                  if (searchMode === "name") {
                    clearSearch();
                  } else {
                    clearContentSearch();
                  }
                }
              },
              searchMode === "content" ? 500 : 300,
            );
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              setSearchValue("");
              if (searchMode === "name") {
                clearSearch();
              } else {
                clearContentSearch();
              }
              searchRef.current?.blur();
            }
          }}
        />
        {searchValue && (
          <button
            className="text-[#999] hover:text-[#666] mx-1"
            onClick={() => {
              setSearchValue("");
              if (searchMode === "name") {
                clearSearch();
              } else {
                clearContentSearch();
              }
            }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
