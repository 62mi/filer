import { invoke } from "@tauri-apps/api/core";
import { Loader } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAiStore } from "../../stores/aiStore";
import { useIconStore } from "../../stores/iconStore";
import { useExplorerStore } from "../../stores/panelStore";
import { useRuleStore } from "../../stores/ruleStore";
import { getGridCellHeight, getGridCellWidth, useSettingsStore } from "../../stores/settingsStore";
import { useSuggestionStore } from "../../stores/suggestionStore";
import { toast } from "../../stores/toastStore";
import { useUndoStore } from "../../stores/undoStore";
import type { FileEntry } from "../../types";
import { AiOrganizer } from "../AiOrganizer";
import { ContextMenu } from "../ContextMenu";
import { DragSuggestion } from "../DragSuggestion/DragSuggestion";
import { PropertiesDialog } from "../PropertiesDialog";
import { QuickLook } from "../QuickLook";
import { PatternSuggestionBanner, RuleSuggestionBanner } from "../RuleSuggestion";
import { ColumnHeader } from "./ColumnHeader";
import { createDragGhost, removeDragGhost } from "./DragGhost";
import { FileRow } from "./FileRow";
import { GridView } from "./GridView";
import { Toolbar } from "./Toolbar";

export function Panel() {
  const tab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0]);
  const viewMode = tab.viewMode;
  const showHidden = useExplorerStore((s) => s.showHidden);
  const showHiddenRef = useRef(showHidden);
  const clipboard = useExplorerStore((s) => s.clipboard);
  const loadDirectory = useExplorerStore((s) => s.loadDirectory);
  const navigateUp = useExplorerStore((s) => s.navigateUp);
  const navigateBack = useExplorerStore((s) => s.navigateBack);
  const navigateForward = useExplorerStore((s) => s.navigateForward);
  const setCursor = useExplorerStore((s) => s.setCursor);
  const toggleSelection = useExplorerStore((s) => s.toggleSelection);
  const selectRange = useExplorerStore((s) => s.selectRange);
  const selectAll = useExplorerStore((s) => s.selectAll);
  const clearSelection = useExplorerStore((s) => s.clearSelection);
  const setSort = useExplorerStore((s) => s.setSort);
  const toggleHidden = useExplorerStore((s) => s.toggleHidden);
  const startRename = useExplorerStore((s) => s.startRename);
  const commitRename = useExplorerStore((s) => s.commitRename);
  const commitRenameAndNext = useExplorerStore((s) => s.commitRenameAndNext);
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
  const suggestionTimerRef = useRef<number | null>(null);
  const suggestionKeyRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  const aiDialogOpen = useAiStore((s) => s.dialogOpen);
  const aiDialogTabId = useAiStore((s) => s.dialogTabId);
  const showAiPanel = aiDialogOpen && aiDialogTabId === tab.id;

  const checkForPatterns = useRuleStore((s) => s.checkForPatterns);
  const checkedFoldersRef = useRef<Set<string>>(new Set());
  const patternRecheckTimerRef = useRef<number | null>(null);

  // ドロップ移動後にパターン検出を再トリガー（2秒遅延）
  const schedulePatternRecheck = useCallback(() => {
    if (patternRecheckTimerRef.current) {
      clearTimeout(patternRecheckTimerRef.current);
    }
    patternRecheckTimerRef.current = window.setTimeout(() => {
      checkedFoldersRef.current.delete(tab.path); // リセットして再チェック可能に
      checkForPatterns(tab.path);
      checkedFoldersRef.current.add(tab.path);
      patternRecheckTimerRef.current = null;
    }, 2000);
  }, [tab.path, checkForPatterns]);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    targetIndex: number | null;
  } | null>(null);
  const [propertiesEntry, setPropertiesEntry] = useState<FileEntry | null>(null);
  const [quickLookOpen, setQuickLookOpen] = useState(false);

  // The entries to display: search results or normal directory entries
  const displayEntries = tab.searchResults ?? tab.entries;

  // Initial load
  useEffect(() => {
    loadDirectory(tab.path);
  }, [loadDirectory, tab.path]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload on showHidden change
  useEffect(() => {
    if (showHiddenRef.current !== showHidden) {
      showHiddenRef.current = showHidden;
      loadDirectory(tab.path, false);
    }
  }, [showHidden, loadDirectory, tab.path]);

  // パターン検出（フォルダごとに1回、3秒遅延）
  useEffect(() => {
    if (tab.loading || tab.searching) return;
    const folderPath = tab.path;
    if (checkedFoldersRef.current.has(folderPath)) return;
    const timer = window.setTimeout(() => {
      checkedFoldersRef.current.add(folderPath);
      checkForPatterns(folderPath);
    }, 3000);
    return () => clearTimeout(timer);
  }, [tab.path, tab.loading, tab.searching, checkForPatterns]);

  // アイコン取得（ディレクトリ読込後）
  const fetchIcons = useIconStore((s) => s.fetchIcons);
  useEffect(() => {
    if (tab.loading || displayEntries.length === 0) return;
    const exts = new Set<string>();
    exts.add("__directory__");
    for (const e of displayEntries) {
      if (!e.is_dir && e.extension) exts.add(e.extension);
    }
    fetchIcons(Array.from(exts));
  }, [displayEntries, tab.loading, fetchIcons]);

  // Scroll to keep cursor visible
  useEffect(() => {
    if (!listRef.current) return;
    const container = listRef.current;
    const settings = useSettingsStore.getState();

    if (viewMode === "icons") {
      const cellW = getGridCellWidth(settings) + settings.gridGap;
      const cellH = getGridCellHeight(settings) + settings.gridGap;
      const cols = Math.max(1, Math.floor(container.clientWidth / cellW));
      const row = Math.floor(tab.cursorIndex / cols);
      const cursorTop = row * cellH;
      const cursorBottom = cursorTop + cellH;

      if (cursorTop < container.scrollTop) {
        container.scrollTop = cursorTop;
      } else if (cursorBottom > container.scrollTop + container.clientHeight) {
        container.scrollTop = cursorBottom - container.clientHeight;
      }
    } else {
      const rowHeight = settings.detailRowHeight;
      const cursorTop = tab.cursorIndex * rowHeight;
      const cursorBottom = cursorTop + rowHeight;

      if (cursorTop < container.scrollTop) {
        container.scrollTop = cursorTop;
      } else if (cursorBottom > container.scrollTop + container.clientHeight) {
        container.scrollTop = cursorBottom - container.clientHeight;
      }
    }
  }, [tab.cursorIndex, viewMode]);

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
        e.dataTransfer.effectAllowed = "all";
        e.dataTransfer.setData("text/plain", entry.path);
        // Collect all dragged paths (selected or just the one)
        const indices =
          tab.selectedIndices.size > 0 && tab.selectedIndices.has(index)
            ? Array.from(tab.selectedIndices)
            : [index];
        const dragEntries = indices.map((i) => displayEntries[i]).filter(Boolean);
        const paths = dragEntries.map((de) => de.path);
        e.dataTransfer.setData("application/x-filer-paths", JSON.stringify(paths));

        // カスタムゴーストイメージ（同期的にDOM作成→setDragImage）
        const ghostCard = createDragGhost(
          dragEntries.map((de) => ({ name: de.name, is_dir: de.is_dir })),
        );
        e.dataTransfer.setDragImage(ghostCard, 20, 16);

        // 移動先サジェスト: 300ms後にポップアップ
        const extensions = dragEntries
          .filter((de) => !de.is_dir)
          .map((de) => de.extension)
          .filter((ext, i, arr) => ext && arr.indexOf(ext) === i);

        const clientX = e.clientX;
        const clientY = e.clientY;

        suggestionTimerRef.current = window.setTimeout(() => {
          useSuggestionStore
            .getState()
            .fetchSuggestions(extensions, tab.path, paths)
            .then(() => {
              useSuggestionStore.getState().show(clientX, clientY);
            });
        }, 300);

        // ドラッグ中のキーボード操作（サジェストナビ）
        const keyHandler = (ke: KeyboardEvent) => {
          const store = useSuggestionStore.getState();
          if (!store.visible) return;
          if (ke.key === "ArrowDown") {
            ke.preventDefault();
            ke.stopPropagation();
            store.selectNext();
          } else if (ke.key === "ArrowUp") {
            ke.preventDefault();
            ke.stopPropagation();
            store.selectPrev();
          } else if (ke.key === "Escape") {
            ke.preventDefault();
            ke.stopPropagation();
            store.hide();
          }
        };
        suggestionKeyRef.current = keyHandler;
        document.addEventListener("keydown", keyHandler, true);
      }
    },
    [displayEntries, tab.selectedIndices, tab.path, setCursor],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      const entry = displayEntries[index];
      if (!entry || index === dragIndex) return;
      // ドラッグ中の選択アイテムにターゲットが含まれていたら無視
      if (dragIndex !== null && tab.selectedIndices.size > 0 && tab.selectedIndices.has(index))
        return;
      // フォルダへのドロップ、またはファイル同士のグループ化
      e.preventDefault();
      e.dataTransfer.dropEffect = entry.is_dir ? (e.ctrlKey ? "copy" : "move") : "move";
      setDropTarget(index);
    },
    [displayEntries, dragIndex, tab.selectedIndices],
  );

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const removeFromStack = useExplorerStore((s) => s.removeFromStack);

  const handleDrop = useCallback(
    async (e: React.DragEvent, index: number) => {
      e.preventDefault();
      setDropTarget(null);
      setDragIndex(null);

      const targetEntry = displayEntries[index];
      if (!targetEntry) return;

      const pathsJson = e.dataTransfer.getData("application/x-filer-paths");
      if (!pathsJson) return;

      const fromStack = e.dataTransfer.getData("application/x-filer-from-stack") === "true";

      try {
        const paths: string[] = JSON.parse(pathsJson);

        // ドラッグ元にターゲット自身が含まれる場合は何もしない
        const targetPathLower = targetEntry.path.toLowerCase();
        if (paths.some((p) => p.toLowerCase() === targetPathLower)) return;

        // ファイル on ファイル → 自動フォルダ化
        if (!targetEntry.is_dir) {
          // ターゲットがファイルの場合、グループ化
          const folderPath: string = await invoke("group_files_into_folder", {
            dragPaths: paths,
            targetPath: targetEntry.path,
          });
          // Undo: folderizeとして記録（ファイル戻し+フォルダ削除）
          const allPaths = [targetEntry.path, ...paths];
          useUndoStore.getState().pushAction({
            type: "folderize",
            entries: allPaths.map((p) => {
              const fileName = p.substring(p.lastIndexOf("\\") + 1);
              return { sourcePath: p, destPath: `${folderPath}\\${fileName}` };
            }),
            createdFolder: folderPath,
          });
          await loadDirectory(tab.path, false);
          return;
        }

        // フォルダへのドロップ（従来動作）
        const undoEntries = paths.map((p) => {
          const fileName = p.substring(p.lastIndexOf("\\") + 1);
          return { sourcePath: p, destPath: `${targetEntry.path}\\${fileName}` };
        });

        const operation = e.ctrlKey ? "copy" : "move";
        if (fromStack) {
          if (e.ctrlKey) {
            await invoke("copy_files", { sources: paths, dest: targetEntry.path });
            useUndoStore.getState().pushAction({ type: "copy", entries: undoEntries });
          } else {
            await invoke("move_files", { sources: paths, dest: targetEntry.path });
            useUndoStore.getState().pushAction({ type: "move", entries: undoEntries });
            paths.forEach((p) => removeFromStack(p));
          }
        } else if (e.ctrlKey) {
          await invoke("copy_files", { sources: paths, dest: targetEntry.path });
          useUndoStore.getState().pushAction({ type: "copy", entries: undoEntries });
        } else {
          await invoke("move_files", { sources: paths, dest: targetEntry.path });
          useUndoStore.getState().pushAction({ type: "move", entries: undoEntries });
        }
        // 移動履歴を記録
        const exts = paths
          .map((p) => {
            const dot = p.lastIndexOf(".");
            const sep = p.lastIndexOf("\\");
            return dot > sep ? p.substring(dot + 1).toLowerCase() : "";
          })
          .filter((v, i, a) => a.indexOf(v) === i);
        invoke("record_move_operation", {
          sourceDir: tab.path,
          destDir: targetEntry.path,
          extensions: exts,
          operation,
          fileCount: paths.length,
        })
          .then(() => schedulePatternRecheck())
          .catch((_err) => {});
        await loadDirectory(tab.path, false);
      } catch (err) {
        toast.error(`ファイル操作に失敗しました: ${err}`);
      }
    },
    [displayEntries, tab.path, loadDirectory, removeFromStack, schedulePatternRecheck],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropTarget(null);
    removeDragGhost();
    // サジェストクリーンアップ
    if (suggestionTimerRef.current) {
      clearTimeout(suggestionTimerRef.current);
      suggestionTimerRef.current = null;
    }
    if (suggestionKeyRef.current) {
      document.removeEventListener("keydown", suggestionKeyRef.current, true);
      suggestionKeyRef.current = null;
    }
    useSuggestionStore.getState().hide();
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
        const undoEntries = paths.map((p) => {
          const fileName = p.substring(p.lastIndexOf("\\") + 1);
          return { sourcePath: p, destPath: `${tab.path}\\${fileName}` };
        });

        // 拡張子抽出ヘルパー
        const exts = paths
          .map((p) => {
            const dot = p.lastIndexOf(".");
            const sep = p.lastIndexOf("\\");
            return dot > sep ? p.substring(dot + 1).toLowerCase() : "";
          })
          .filter((v, i, a) => a.indexOf(v) === i);
        const recordMove = (sourceDir: string, op: string) => {
          invoke("record_move_operation", {
            sourceDir,
            destDir: tab.path,
            extensions: exts,
            operation: op,
            fileCount: paths.length,
          })
            .then(() => schedulePatternRecheck())
            .catch((_err) => {});
        };

        if (fromStack) {
          if (e.ctrlKey) {
            await invoke("copy_files", { sources: paths, dest: tab.path });
            useUndoStore.getState().pushAction({ type: "copy", entries: undoEntries });
            recordMove(paths[0]?.substring(0, paths[0].lastIndexOf("\\")) || "", "copy");
          } else {
            await invoke("move_files", { sources: paths, dest: tab.path });
            useUndoStore.getState().pushAction({ type: "move", entries: undoEntries });
            paths.forEach((p) => removeFromStack(p));
            recordMove(paths[0]?.substring(0, paths[0].lastIndexOf("\\")) || "", "move");
          }
          await loadDirectory(tab.path, false);
          return;
        }

        // 通常のドラッグ: 同一ディレクトリからは無視
        const sourceDir = paths[0]?.substring(0, paths[0].lastIndexOf("\\")) || "";
        const isFromHere = paths.every((p) => {
          const parent = p.substring(0, p.lastIndexOf("\\"));
          return parent.toLowerCase() === tab.path.toLowerCase();
        });
        if (isFromHere) return;

        if (e.ctrlKey) {
          await invoke("copy_files", { sources: paths, dest: tab.path });
          useUndoStore.getState().pushAction({ type: "copy", entries: undoEntries });
          recordMove(sourceDir, "copy");
        } else {
          await invoke("move_files", { sources: paths, dest: tab.path });
          useUndoStore.getState().pushAction({ type: "move", entries: undoEntries });
          recordMove(sourceDir, "move");
        }
        await loadDirectory(tab.path, false);
      } catch (_err) {}
    },
    [tab.path, loadDirectory, removeFromStack, schedulePatternRecheck],
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

      // Grid mode: calculate columns from container width
      const getGridCols = () => {
        if (activeTab.viewMode !== "icons" || !listRef.current) return 1;
        const s = useSettingsStore.getState();
        const cellW = getGridCellWidth(s) + s.gridGap;
        return Math.max(1, Math.floor(listRef.current.clientWidth / cellW));
      };

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const step = activeTab.viewMode === "icons" ? getGridCols() : 1;
          if (e.shiftKey && !e.altKey) {
            const nextDown = Math.min(activeTab.cursorIndex + step, entries.length - 1);
            useExplorerStore.getState().selectRange(activeTab.cursorIndex, nextDown);
          } else if (!e.altKey) {
            setCursor(activeTab.cursorIndex + step);
          }
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const step = activeTab.viewMode === "icons" ? getGridCols() : 1;
          if (e.shiftKey && !e.altKey) {
            const nextUp = Math.max(activeTab.cursorIndex - step, 0);
            useExplorerStore.getState().selectRange(activeTab.cursorIndex, nextUp);
          } else if (!e.altKey) {
            setCursor(activeTab.cursorIndex - step);
          }
          break;
        }
        case "Enter": {
          e.preventDefault();
          const entry = entries[activeTab.cursorIndex];
          if (entry) handleNavigate(entry);
          break;
        }
        case "Backspace":
          e.preventDefault();
          if (e.altKey) {
            // Alt+Backspace: 親フォルダへ
            navigateUp();
          } else {
            // Backspace: 履歴の前に戻る
            navigateBack();
          }
          break;
        case " ":
          e.preventDefault();
          if (e.repeat) break;
          if (e.ctrlKey) {
            // Ctrl+Space: 選択トグル
            toggleSelection(activeTab.cursorIndex);
            setCursor(activeTab.cursorIndex + 1);
          } else {
            // Space: QuickLookを開く
            // ※QuickLookが開いてる時はQuickLook側でstopPropagationされるのでここには来ない
            const qlEntry = entries[activeTab.cursorIndex];
            if (qlEntry) {
              setQuickLookOpen(true);
            }
          }
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
        case ",":
          if (e.ctrlKey) {
            e.preventDefault();
            useSettingsStore.getState().openSettings();
          }
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
          } else if (activeTab.viewMode === "icons" && !e.shiftKey) {
            e.preventDefault();
            setCursor(activeTab.cursorIndex - 1);
          } else if (activeTab.viewMode === "icons" && e.shiftKey) {
            e.preventDefault();
            const prevIdx = Math.max(activeTab.cursorIndex - 1, 0);
            useExplorerStore.getState().selectRange(activeTab.cursorIndex, prevIdx);
          }
          break;
        case "ArrowRight":
          if (e.altKey) {
            e.preventDefault();
            navigateForward();
          } else if (activeTab.viewMode === "icons" && !e.shiftKey) {
            e.preventDefault();
            setCursor(activeTab.cursorIndex + 1);
          } else if (activeTab.viewMode === "icons" && e.shiftKey) {
            e.preventDefault();
            const nextIdx = Math.min(activeTab.cursorIndex + 1, entries.length - 1);
            useExplorerStore.getState().selectRange(activeTab.cursorIndex, nextIdx);
          }
          break;
        case "F5":
          e.preventDefault();
          loadDirectory(activeTab.path, false);
          break;
        case "z":
          if (e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            useUndoStore
              .getState()
              .undo()
              .then(() => {
                const currentTab = useExplorerStore.getState().getActiveTab();
                loadDirectory(currentTab.path, false, true);
              })
              .catch((err) => toast.error(`元に戻す操作に失敗しました: ${err}`));
          }
          break;
        case "y":
          if (e.ctrlKey) {
            e.preventDefault();
            useUndoStore
              .getState()
              .redo()
              .then(() => {
                const currentTab = useExplorerStore.getState().getActiveTab();
                loadDirectory(currentTab.path, false, true);
              })
              .catch((err) => toast.error(`やり直し操作に失敗しました: ${err}`));
          }
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

  // マウスサイドボタンで戻る/進む
  useEffect(() => {
    const handleMouseButton = (e: MouseEvent) => {
      if (e.button === 3) {
        // サイドボタン（戻る）
        e.preventDefault();
        navigateBack();
      } else if (e.button === 4) {
        // サイドボタン（進む）
        e.preventDefault();
        navigateForward();
      }
    };
    window.addEventListener("mouseup", handleMouseButton);
    return () => window.removeEventListener("mouseup", handleMouseButton);
  }, [navigateBack, navigateForward]);

  // Ctrl+Wheel でアイコンサイズ変更 & 詳細↔グリッドのシームレス遷移
  // document レベル + capture で WebView ズームより先にインターセプト
  useEffect(() => {
    const MIN_GRID = 48;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      // ファイルリスト領域内のホイールのみ対象
      if (!listRef.current?.contains(e.target as Node)) return;

      const state = useExplorerStore.getState();
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0];
      const settings = useSettingsStore.getState();
      const scrollingUp = e.deltaY < 0; // up = サイズ拡大

      // 詳細モード: Ctrl+ホイール上でグリッドモードに遷移
      if (activeTab.viewMode === "details") {
        if (scrollingUp) {
          e.preventDefault();
          e.stopPropagation();
          settings.setGridIconSize(MIN_GRID);
          state.setViewMode("icons");
        }
        return;
      }

      // グリッドモード
      e.preventDefault();
      e.stopPropagation();
      const oldSize = settings.gridIconSize;
      const delta = scrollingUp ? 8 : -8;
      const newSize = oldSize + delta;

      // 最小以下に縮小 → 詳細モードに遷移
      if (newSize < MIN_GRID) {
        state.setViewMode("details");
        return;
      }

      settings.setGridIconSize(newSize);
    };
    document.addEventListener("wheel", handler, { capture: true, passive: false });
    return () => document.removeEventListener("wheel", handler, { capture: true });
  }, []);

  // サジェスト選択時のファイル移動
  const handleSuggestionSelect = useCallback(
    async (destPath: string) => {
      const store = useSuggestionStore.getState();
      const paths = store.draggedPaths;
      if (paths.length === 0) return;

      try {
        await invoke("move_files", { sources: paths, dest: destPath });
        const undoEntries = paths.map((p) => {
          const fileName = p.substring(p.lastIndexOf("\\") + 1);
          return { sourcePath: p, destPath: `${destPath}\\${fileName}` };
        });
        useUndoStore.getState().pushAction({ type: "move", entries: undoEntries });

        // 履歴記録
        const exts = paths
          .map((p) => {
            const dot = p.lastIndexOf(".");
            const sep = p.lastIndexOf("\\");
            return dot > sep ? p.substring(dot + 1).toLowerCase() : "";
          })
          .filter((v, i, a) => a.indexOf(v) === i);
        invoke("record_move_operation", {
          sourceDir: tab.path,
          destDir: destPath,
          extensions: exts,
          operation: "move",
          fileCount: paths.length,
        })
          .then(() => schedulePatternRecheck())
          .catch((_err) => {});

        await loadDirectory(tab.path, false);
      } catch (_err) {
      } finally {
        useSuggestionStore.getState().hide();
      }
    },
    [tab.path, loadDirectory, schedulePatternRecheck],
  );

  // Determine which paths are "cut" for visual feedback
  const cutPaths = clipboard?.operation === "cut" ? new Set(clipboard.paths) : new Set<string>();

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <Toolbar />

      {/* Column headers (details mode only) */}
      {viewMode === "details" && (
        <ColumnHeader sortKey={tab.sortKey} sortOrder={tab.sortOrder} onSort={setSort} />
      )}

      {/* AI Organizer inline panel */}
      {showAiPanel && <AiOrganizer tabId={tab.id} />}

      {/* Rule suggestion banner */}
      <RuleSuggestionBanner />

      {/* Pattern suggestion banner */}
      <PatternSuggestionBanner currentPath={tab.path} />

      {/* File list */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onClick={(e) => {
          // 背景（ファイル行以外）をクリックしたら選択解除
          if (e.target === e.currentTarget) {
            clearSelection();
          }
        }}
        onContextMenu={handleBgContextMenu}
        onDragOver={handleBgDragOver}
        onDrop={handleBgDrop}
      >
        {(tab.loading || tab.searching) && (
          <div className="flex items-center justify-center h-full text-[#999] gap-2">
            <Loader className="w-4 h-4 animate-spin" />
            {tab.searching ? "検索中..." : "読み込み中..."}
          </div>
        )}
        {tab.error && (
          <div className="flex items-center justify-center h-full text-red-600 px-4 text-sm animate-slide-up">
            {tab.error}
          </div>
        )}
        {!tab.loading && !tab.searching && !tab.error && displayEntries.length === 0 && (
          <div className="flex items-center justify-center h-full text-[#999] animate-fade-in">
            {tab.searchResults !== null ? "見つかりませんでした。" : "このフォルダーは空です。"}
          </div>
        )}
        {!tab.loading &&
          !tab.searching &&
          !tab.error &&
          (viewMode === "details" ? (
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
                isFolderizeTarget={index === dropTarget && !entry.is_dir}
                onNavigate={handleNavigate}
                onSelect={() => toggleSelection(index)}
                onSelectRange={(toIndex) => selectRange(tab.cursorIndex, toIndex)}
                onCursor={(i) => setCursor(i)}
                onContextMenu={handleContextMenu}
                onCommitRename={commitRename}
                onCommitRenameAndNext={commitRenameAndNext}
                onCancelRename={cancelRename}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onClearSelection={clearSelection}
                selectedCount={tab.selectedIndices.size}
                onStartRename={startRename}
              />
            ))
          ) : (
            <GridView
              entries={displayEntries}
              cursorIndex={tab.cursorIndex}
              selectedIndices={tab.selectedIndices}
              renamingIndex={tab.renamingIndex}
              cutPaths={cutPaths}
              dropTarget={dropTarget}
              onNavigate={handleNavigate}
              onSelect={toggleSelection}
              onSelectRange={selectRange}
              onCursor={setCursor}
              onContextMenu={handleContextMenu}
              onCommitRename={commitRename}
              onCommitRenameAndNext={commitRenameAndNext}
              onCancelRename={cancelRename}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              onClearSelection={clearSelection}
              onStartRename={startRename}
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

      {/* Quick Look overlay */}
      {quickLookOpen && displayEntries[tab.cursorIndex] && (
        <QuickLook
          entry={displayEntries[tab.cursorIndex]}
          onClose={() => setQuickLookOpen(false)}
          onPrev={() => {
            if (tab.cursorIndex > 0) {
              setCursor(tab.cursorIndex - 1);
            }
          }}
          onNext={() => {
            if (tab.cursorIndex < displayEntries.length - 1) {
              setCursor(tab.cursorIndex + 1);
            }
          }}
        />
      )}

      {/* 移動先サジェストポップアップ */}
      <DragSuggestion onSelectDestination={handleSuggestionSelect} />
    </div>
  );
}
