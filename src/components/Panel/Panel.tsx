import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useExplorerStore } from "../../stores/panelStore";
import type { FileEntry } from "../../types";
import { ContextMenu } from "../ContextMenu";
import { PropertiesDialog } from "../PropertiesDialog";
import { ColumnHeader } from "./ColumnHeader";
import { FileRow } from "./FileRow";

export function Panel() {
  const tab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0]);
  const showHidden = useExplorerStore((s) => s.showHidden);
  const clipboard = useExplorerStore((s) => s.clipboard);
  const loadDirectory = useExplorerStore((s) => s.loadDirectory);
  const navigateUp = useExplorerStore((s) => s.navigateUp);
  const navigateBack = useExplorerStore((s) => s.navigateBack);
  const navigateForward = useExplorerStore((s) => s.navigateForward);
  const setCursor = useExplorerStore((s) => s.setCursor);
  const toggleSelection = useExplorerStore((s) => s.toggleSelection);
  const selectAll = useExplorerStore((s) => s.selectAll);
  const setSort = useExplorerStore((s) => s.setSort);
  const toggleHidden = useExplorerStore((s) => s.toggleHidden);
  const startRename = useExplorerStore((s) => s.startRename);
  const commitRename = useExplorerStore((s) => s.commitRename);
  const cancelRename = useExplorerStore((s) => s.cancelRename);
  const clipboardCopy = useExplorerStore((s) => s.clipboardCopy);
  const clipboardCut = useExplorerStore((s) => s.clipboardCut);
  const clipboardPaste = useExplorerStore((s) => s.clipboardPaste);
  const deleteSelected = useExplorerStore((s) => s.deleteSelected);
  const addTab = useExplorerStore((s) => s.addTab);
  const closeTab = useExplorerStore((s) => s.closeTab);
  const nextTab = useExplorerStore((s) => s.nextTab);
  const prevTab = useExplorerStore((s) => s.prevTab);
  const addToStack = useExplorerStore((s) => s.addToStack);
  const pasteFromStack = useExplorerStore((s) => s.pasteFromStack);

  const listRef = useRef<HTMLDivElement>(null);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    targetIndex: number | null;
  } | null>(null);
  const [propertiesEntry, setPropertiesEntry] = useState<FileEntry | null>(null);

  // The entries to display: search results or normal directory entries
  const displayEntries = tab.searchResults ?? tab.entries;

  // Initial load
  useEffect(() => {
    loadDirectory(tab.path);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload on showHidden change
  useEffect(() => {
    loadDirectory(tab.path, false);
  }, [showHidden]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to keep cursor visible
  useEffect(() => {
    if (!listRef.current) return;
    const rowHeight = 28;
    const container = listRef.current;
    const cursorTop = tab.cursorIndex * rowHeight;
    const cursorBottom = cursorTop + rowHeight;

    if (cursorTop < container.scrollTop) {
      container.scrollTop = cursorTop;
    } else if (cursorBottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = cursorBottom - container.clientHeight;
    }
  }, [tab.cursorIndex]);

  const handleNavigate = useCallback(
    (entry: FileEntry) => {
      if (entry.is_dir) {
        loadDirectory(entry.path);
      } else {
        invoke("open_in_default_app", { path: entry.path });
      }
    },
    [loadDirectory],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      setCursor(index);
      setContextMenu({ x: e.clientX, y: e.clientY, targetIndex: index });
    },
    [setCursor],
  );

  const handleBgContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, targetIndex: null });
  }, []);

  // Drag & drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      setCursor(index);
      setDragIndex(index);
      const entry = displayEntries[index];
      if (entry) {
        e.dataTransfer.effectAllowed = "copyMove";
        e.dataTransfer.setData("text/plain", entry.path);
        // Collect all dragged paths (selected or just the one)
        const indices =
          tab.selectedIndices.size > 0 && tab.selectedIndices.has(index)
            ? Array.from(tab.selectedIndices)
            : [index];
        const paths = indices.map((i) => displayEntries[i]?.path).filter(Boolean);
        e.dataTransfer.setData("application/x-filer-paths", JSON.stringify(paths));
      }
    },
    [displayEntries, tab.selectedIndices, setCursor],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      const entry = displayEntries[index];
      if (entry?.is_dir && index !== dragIndex) {
        e.preventDefault();
        e.dataTransfer.dropEffect = e.ctrlKey ? "copy" : "move";
        setDropTarget(index);
      }
    },
    [displayEntries, dragIndex],
  );

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const clearStack = useExplorerStore((s) => s.clearStack);

  const handleDrop = useCallback(
    async (e: React.DragEvent, index: number) => {
      e.preventDefault();
      setDropTarget(null);
      setDragIndex(null);

      const targetEntry = displayEntries[index];
      if (!targetEntry?.is_dir) return;

      const pathsJson = e.dataTransfer.getData("application/x-filer-paths");
      if (!pathsJson) return;

      const fromStack = e.dataTransfer.getData("application/x-filer-from-stack") === "true";

      try {
        const paths: string[] = JSON.parse(pathsJson);
        if (fromStack) {
          // スタックからのドロップ: デフォルト移動、Ctrlでコピー
          if (e.ctrlKey) {
            await invoke("copy_files", { sources: paths, dest: targetEntry.path });
          } else {
            await invoke("move_files", { sources: paths, dest: targetEntry.path });
            clearStack();
          }
        } else if (e.ctrlKey) {
          await invoke("copy_files", { sources: paths, dest: targetEntry.path });
        } else {
          await invoke("move_files", { sources: paths, dest: targetEntry.path });
        }
        await loadDirectory(tab.path, false);
      } catch (err) {
        console.error("Drop failed:", err);
      }
    },
    [displayEntries, tab.path, loadDirectory, clearStack],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropTarget(null);
  }, []);

  // Background drop (drop onto current directory from external or stack)
  const handleBgDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = e.ctrlKey ? "copy" : "move";
  }, []);

  const handleBgDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const pathsJson = e.dataTransfer.getData("application/x-filer-paths");
      if (!pathsJson) return;

      const fromStack = e.dataTransfer.getData("application/x-filer-from-stack") === "true";

      try {
        const paths: string[] = JSON.parse(pathsJson);

        if (fromStack) {
          // スタックからのドロップ: デフォルト移動、Ctrlでコピー
          if (e.ctrlKey) {
            await invoke("copy_files", { sources: paths, dest: tab.path });
          } else {
            await invoke("move_files", { sources: paths, dest: tab.path });
            clearStack();
          }
          await loadDirectory(tab.path, false);
          return;
        }

        // 通常のドラッグ: 同一ディレクトリからは無視
        const isFromHere = paths.every((p) => {
          const parent = p.substring(0, p.lastIndexOf("\\"));
          return parent.toLowerCase() === tab.path.toLowerCase();
        });
        if (isFromHere) return;

        if (e.ctrlKey) {
          await invoke("copy_files", { sources: paths, dest: tab.path });
        } else {
          await invoke("move_files", { sources: paths, dest: tab.path });
        }
        await loadDirectory(tab.path, false);
      } catch (err) {
        console.error("Drop failed:", err);
      }
    },
    [tab.path, loadDirectory, clearStack],
  );

  // Keyboard handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const state = useExplorerStore.getState();
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0];
      const entries = activeTab.searchResults ?? activeTab.entries;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setCursor(activeTab.cursorIndex + 1);
          break;
        case "ArrowUp":
          e.preventDefault();
          setCursor(activeTab.cursorIndex - 1);
          break;
        case "Enter": {
          e.preventDefault();
          const entry = entries[activeTab.cursorIndex];
          if (entry) handleNavigate(entry);
          break;
        }
        case "Backspace":
          if (!e.altKey) {
            e.preventDefault();
            navigateUp();
          }
          break;
        case " ":
          e.preventDefault();
          toggleSelection(activeTab.cursorIndex);
          setCursor(activeTab.cursorIndex + 1);
          break;
        case "Home":
          e.preventDefault();
          setCursor(0);
          break;
        case "End":
          e.preventDefault();
          setCursor(entries.length - 1);
          break;
        case "a":
          if (e.ctrlKey) {
            e.preventDefault();
            selectAll();
          }
          break;
        case "c":
          if (e.ctrlKey) {
            e.preventDefault();
            clipboardCopy();
          }
          break;
        case "x":
          if (e.ctrlKey) {
            e.preventDefault();
            clipboardCut();
          }
          break;
        case "v":
          if (e.ctrlKey) {
            e.preventDefault();
            clipboardPaste();
          }
          break;
        case "S":
        case "s":
          if (e.ctrlKey && e.shiftKey) {
            e.preventDefault();
            const indices =
              activeTab.selectedIndices.size > 0
                ? Array.from(activeTab.selectedIndices)
                : [activeTab.cursorIndex];
            const paths = indices.map((i) => entries[i]?.path).filter(Boolean);
            if (paths.length > 0) addToStack(paths);
          }
          break;
        case "V":
          if (e.ctrlKey && e.shiftKey) {
            e.preventDefault();
            // Ctrl+Shift+V: Move from stack to current directory (default)
            pasteFromStack("move");
          }
          break;
        case "t":
          if (e.ctrlKey) {
            e.preventDefault();
            addTab();
          }
          break;
        case "w":
          if (e.ctrlKey) {
            e.preventDefault();
            closeTab(state.activeTabId);
          }
          break;
        case "Tab":
          if (e.ctrlKey) {
            e.preventDefault();
            if (e.shiftKey) prevTab();
            else nextTab();
          }
          break;
        case "Delete":
          e.preventDefault();
          deleteSelected();
          break;
        case "F2":
          e.preventDefault();
          startRename(activeTab.cursorIndex);
          break;
        case "h":
          if (e.ctrlKey) {
            e.preventDefault();
            toggleHidden();
          }
          break;
        case "ArrowLeft":
          if (e.altKey) {
            e.preventDefault();
            navigateBack();
          }
          break;
        case "ArrowRight":
          if (e.altKey) {
            e.preventDefault();
            navigateForward();
          }
          break;
        case "F5":
          e.preventDefault();
          loadDirectory(activeTab.path, false);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleNavigate,
    setCursor,
    toggleSelection,
    selectAll,
    navigateUp,
    navigateBack,
    navigateForward,
    loadDirectory,
    toggleHidden,
    clipboardCopy,
    clipboardCut,
    clipboardPaste,
    deleteSelected,
    startRename,
    addTab,
    closeTab,
    nextTab,
    prevTab,
    addToStack,
    pasteFromStack,
  ]);

  // Determine which paths are "cut" for visual feedback
  const cutPaths = clipboard?.operation === "cut" ? new Set(clipboard.paths) : new Set<string>();

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Column headers */}
      <ColumnHeader sortKey={tab.sortKey} sortOrder={tab.sortOrder} onSort={setSort} />

      {/* File list */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onContextMenu={handleBgContextMenu}
        onDragOver={handleBgDragOver}
        onDrop={handleBgDrop}
      >
        {(tab.loading || tab.searching) && (
          <div className="flex items-center justify-center h-full text-[#999]">
            {tab.searching ? "Searching..." : "Loading..."}
          </div>
        )}
        {tab.error && (
          <div className="flex items-center justify-center h-full text-red-600 px-4 text-sm">
            {tab.error}
          </div>
        )}
        {!tab.loading && !tab.searching && !tab.error && displayEntries.length === 0 && (
          <div className="flex items-center justify-center h-full text-[#999]">
            {tab.searchResults !== null ? "No results found." : "This folder is empty."}
          </div>
        )}
        {!tab.loading &&
          !tab.searching &&
          !tab.error &&
          displayEntries.map((entry, index) => (
            <FileRow
              key={entry.path}
              entry={entry}
              index={index}
              isCursor={index === tab.cursorIndex}
              isSelected={tab.selectedIndices.has(index)}
              isRenaming={index === tab.renamingIndex}
              isCut={cutPaths.has(entry.path)}
              isDropTarget={index === dropTarget}
              onNavigate={handleNavigate}
              onSelect={() => toggleSelection(index)}
              onCursor={(i) => setCursor(i)}
              onContextMenu={handleContextMenu}
              onCommitRename={commitRename}
              onCancelRename={cancelRename}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          targetIndex={contextMenu.targetIndex}
          onClose={() => setContextMenu(null)}
          onProperties={(entry) => {
            setContextMenu(null);
            setPropertiesEntry(entry);
          }}
        />
      )}

      {/* Properties dialog */}
      {propertiesEntry && (
        <PropertiesDialog entry={propertiesEntry} onClose={() => setPropertiesEntry(null)} />
      )}
    </div>
  );
}
