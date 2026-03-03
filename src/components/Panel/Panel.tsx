import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { resolveResource } from "@tauri-apps/api/path";
import { Loader } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRubberBand } from "../../hooks/useRubberBand";
import {
  clearHighlight,
  findDropZone,
  handleNativeDrop,
  setHighlight,
} from "../../hooks/useNativeDrop";
import { getTranslation, useTranslation } from "../../i18n";
import { useAiStore } from "../../stores/aiStore";
import { useCommandPaletteStore } from "../../stores/commandPaletteStore";
import { useDirSizeStore } from "../../stores/dirSizeStore";
import { useIconStore } from "../../stores/iconStore";
import { applyFilters, useExplorerStore } from "../../stores/panelStore";
import { useRuleStore } from "../../stores/ruleStore";
import type { ColumnWidths } from "../../stores/settingsStore";
import { getGridCellHeight, getGridCellWidth, useSettingsStore } from "../../stores/settingsStore";
import { useSuggestionStore } from "../../stores/suggestionStore";
import { useThumbnailStore } from "../../stores/thumbnailStore";
import { toast } from "../../stores/toastStore";
import { useUndoStore } from "../../stores/undoStore";
import type { FileEntry } from "../../types";
import { generateDragIcon } from "../../utils/dragIcon";
import { getFileType } from "../../utils/fileType";
import { formatDate, formatFileSize } from "../../utils/format";
import { AiOrganizer } from "../AiOrganizer";
import { showNativeContextMenu } from "../ContextMenu";
import { DragSuggestion } from "../DragSuggestion/DragSuggestion";
import { PropertiesDialog } from "../PropertiesDialog";
import { QuickLook } from "../QuickLook";
import { PatternSuggestionBanner, RuleSuggestionBanner } from "../RuleSuggestion";
import { ColumnHeader } from "./ColumnHeader";
import { FileRow } from "./FileRow";
import { GridView } from "./GridView";
import { Toolbar } from "./Toolbar";

export function Panel() {
  const t = useTranslation();
  const tab = useExplorerStore((s) => s.tabs.find((tt) => tt.id === s.activeTabId) || s.tabs[0]);
  const viewMode = tab.viewMode;
  const showHidden = useExplorerStore((s) => s.showHidden);
  const showHiddenRef = useRef(showHidden);
  const clipboard = useExplorerStore((s) => s.clipboard);
  const loadDirectory = useExplorerStore((s) => s.loadDirectory);
  const navigateUp = useExplorerStore((s) => s.navigateUp);
  const navigateBack = useExplorerStore((s) => s.navigateBack);
  const navigateForward = useExplorerStore((s) => s.navigateForward);
  const setCursor = useExplorerStore((s) => s.setCursor);
  const cursorVisible = useExplorerStore((s) => s.cursorVisible);
  const setCursorVisible = useExplorerStore((s) => s.setCursorVisible);
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
  const { rect: rubberBandRect, handleMouseDown: handleRubberBandMouseDown, justFinished: rubberBandJustFinishedRef } = useRubberBand(listRef);
  const prevPathRef = useRef(tab.path);
  const prevLoadingRef = useRef(tab.loading);
  const suggestionTimerRef = useRef<number | null>(null);

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

  const [propertiesEntry, setPropertiesEntry] = useState<FileEntry | null>(null);
  const [quickLookOpen, setQuickLookOpen] = useState(false);

  // フォルダサイズ（フィルタ・サイズバー両方で使用）
  const dirSizes = useDirSizeStore((s) => s.sizes);

  // The entries to display: search results or filtered directory entries
  const displayEntries = useMemo(() => {
    const base = tab.searchResults ?? tab.entries;
    return tab.searchResults ? base : applyFilters(base, tab.filter, dirSizes);
  }, [tab.entries, tab.searchResults, tab.filter, dirSizes]);
  const maxFileSize = useMemo(() => {
    let max = 0;
    for (const e of displayEntries) {
      const size = e.is_dir ? (dirSizes[e.path] ?? 0) : e.size;
      if (size > max) max = size;
    }
    return max;
  }, [displayEntries, dirSizes]);

  // ダブルクリックで列幅を内容に自動フィット
  const handleAutoFit = useCallback(
    (key: keyof ColumnWidths) => {
      if (displayEntries.length === 0) return;
      const settings = useSettingsStore.getState();
      const font = `${settings.fontSize}px system-ui, -apple-system, sans-serif`;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.font = font;

      const padding = 16; // px-2 左右合計
      let maxW = 0;

      for (const entry of displayEntries) {
        let text: string;
        switch (key) {
          case "name":
            text = entry.name;
            break;
          case "modified":
            text = formatDate(entry.modified);
            break;
          case "extension":
            text = getFileType(entry);
            break;
          case "size": {
            const size = entry.is_dir ? (dirSizes[entry.path] ?? 0) : entry.size;
            text = size > 0 ? formatFileSize(size) : "";
            break;
          }
        }
        const w = ctx.measureText(text).width;
        if (w > maxW) maxW = w;
      }

      // ヘッダーテキスト幅も考慮
      ctx.font = `${settings.uiFontSize}px system-ui, -apple-system, sans-serif`;
      const headerLabels: Record<keyof ColumnWidths, string> = {
        name: getTranslation().columnHeader.name,
        modified: getTranslation().columnHeader.modified,
        extension: getTranslation().columnHeader.type,
        size: getTranslation().columnHeader.size,
      };
      const headerW = ctx.measureText(headerLabels[key]).width + 16; // ソートアイコン分
      maxW = Math.max(maxW, headerW);

      const newWidth = Math.ceil(maxW + padding + 4); // 余裕4px
      const { setSetting, columnWidths } = useSettingsStore.getState();
      setSetting("columnWidths", { ...columnWidths, [key]: Math.max(newWidth, 60) });
    },
    [displayEntries, dirSizes],
  );

  // Initial load
  useEffect(() => {
    loadDirectory(tab.path, false);
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

  // Scroll to keep cursor visible (パス変更・ロード完了時はカーソルを中心にスクロール)
  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = tab.loading;

    // loading中はスクロールしない
    if (tab.loading || !listRef.current) return;

    const container = listRef.current;
    const justFinishedLoading = wasLoading;
    const isPathChange = prevPathRef.current !== tab.path;
    prevPathRef.current = tab.path;

    // パス変更 or ロード完了 → カーソルを中心にスクロール
    // (navigateBackで2回loadDirectoryが呼ばれる問題を回避: 最後のロード完了時にスクロール)
    const shouldCenter = isPathChange || justFinishedLoading;

    const doScroll = () => {
      const settings = useSettingsStore.getState();

      if (viewMode === "icons") {
        const cellW = getGridCellWidth(settings) + settings.gridGap;
        const cellH = getGridCellHeight(settings) + settings.gridGap;
        const cols = Math.max(1, Math.floor(container.clientWidth / cellW));
        const row = Math.floor(tab.cursorIndex / cols);
        const cursorTop = row * cellH;
        const cursorBottom = cursorTop + cellH;

        if (shouldCenter && tab.cursorIndex > 0) {
          const cursorCenter = cursorTop + cellH / 2;
          container.scrollTop = Math.max(0, cursorCenter - container.clientHeight / 2);
        } else if (cursorTop < container.scrollTop) {
          container.scrollTop = cursorTop;
        } else if (cursorBottom > container.scrollTop + container.clientHeight) {
          container.scrollTop = cursorBottom - container.clientHeight;
        }
      } else {
        const rowHeight = settings.detailRowHeight;
        const headerOffset = settings.columnHeaderHeight;
        const cursorTop = headerOffset + tab.cursorIndex * rowHeight;
        const cursorBottom = cursorTop + rowHeight;

        if (shouldCenter && tab.cursorIndex > 0) {
          const cursorCenter = cursorTop + rowHeight / 2;
          container.scrollTop = Math.max(0, cursorCenter - container.clientHeight / 2);
        } else if (cursorTop < container.scrollTop + headerOffset) {
          container.scrollTop = cursorTop - headerOffset;
        } else if (cursorBottom > container.scrollTop + container.clientHeight) {
          container.scrollTop = cursorBottom - container.clientHeight;
        }
      }
    };

    if (shouldCenter) {
      // ロード完了後: DOMレンダリング完了を待ってからスクロール
      // クリーンアップで2回目のloadDirectoryが始まった場合にキャンセル
      const rafId = requestAnimationFrame(doScroll);
      return () => cancelAnimationFrame(rafId);
    }
    doScroll();
  }, [tab.cursorIndex, tab.path, tab.loading, viewMode]);

  const handleNavigate = useCallback(
    (entry: FileEntry) => {
      if (entry.is_dir) {
        loadDirectory(entry.path);
      } else {
        invoke("open_in_default_app", { path: entry.path }).catch(() => {
          toast.error("ファイルを開けませんでした");
        });
      }
    },
    [loadDirectory],
  );

  const onProperties = useCallback((entry: FileEntry) => {
    setPropertiesEntry(entry);
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      setCursorVisible(false);
      setCursor(index);
      showNativeContextMenu(index, onProperties);
    },
    [setCursor, setCursorVisible, onProperties],
  );

  const handleBgContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      showNativeContextMenu(null, onProperties);
    },
    [onProperties],
  );

  // ハイブリッドドラッグ: カスタム内部ドラッグ + ウィンドウ外でネイティブOS D&D
  const dragStartRef = useRef<{ x: number; y: number; index: number } | null>(null);
  const draggingRef = useRef(false);
  const dragIconRef = useRef<string>("");
  const dragPathsRef = useRef<string[]>([]);
  const [dragGhostPaths, setDragGhostPaths] = useState<{
    paths: string[];
    names: string[];
    isDirs: boolean[];
    extensions: string[];
  } | null>(null);
  const dragGhostRef = useRef<HTMLDivElement>(null);
  const edgeIndicatorRef = useRef<HTMLDivElement>(null);
  const externalDragIconRef = useRef<string | null>(null);

  // 起動時にドラッグアイコンのパスを解決
  useEffect(() => {
    resolveResource("icons/32x32.png")
      .then((p) => {
        dragIconRef.current = p;
      })
      .catch(() => {});
  }, []);

  const handleFileMouseDown = useCallback(
    (e: React.MouseEvent, index: number) => {
      if (e.button !== 0) return;
      setCursorVisible(false);
      dragStartRef.current = { x: e.clientX, y: e.clientY, index };
      draggingRef.current = false;
    },
    [setCursorVisible],
  );

  // カスタムドラッグのクリーンアップ
  const cleanupDrag = useCallback(() => {
    draggingRef.current = false;
    dragPathsRef.current = [];
    externalDragIconRef.current = null;
    setDragGhostPaths(null);
    clearHighlight();
    document.body.classList.remove("file-dragging");
    if (suggestionTimerRef.current) {
      clearTimeout(suggestionTimerRef.current);
      suggestionTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const DRAG_THRESHOLD = 5;
    const EDGE_MARGIN = 40; // ウィンドウ端フィードバック開始マージン (px)

    const handleMouseMove = (e: MouseEvent) => {
      const start = dragStartRef.current;

      // カスタムドラッグ中: ゴースト追従 + ハイライト更新 + ウィンドウ外検出
      if (draggingRef.current) {
        // ウィンドウ外判定（座標ベース — mouseleaveより確実）
        const isOutside =
          e.clientX <= 2 ||
          e.clientY <= 2 ||
          e.clientX >= window.innerWidth - 2 ||
          e.clientY >= window.innerHeight - 2;

        if (isOutside && dragPathsRef.current.length > 0) {
          // ネイティブドラッグに切り替え
          const paths = [...dragPathsRef.current];
          const icon = externalDragIconRef.current || dragIconRef.current || "";
          cleanupDrag();
          useSuggestionStore.getState().hide();

          startDrag({ item: paths, icon }, (payload) => {
            if (payload.result === "Dropped") {
              useExplorerStore.getState().refreshDirectory();
            }
          }).catch(() => {});
          return;
        }

        // ウィンドウ端に近づいたらフィードバック
        const isNearEdge =
          e.clientX <= EDGE_MARGIN ||
          e.clientY <= EDGE_MARGIN ||
          e.clientX >= window.innerWidth - EDGE_MARGIN ||
          e.clientY >= window.innerHeight - EDGE_MARGIN;

        if (dragGhostRef.current) {
          dragGhostRef.current.style.left = `${e.clientX}px`;
          dragGhostRef.current.style.top = `${e.clientY}px`;
          dragGhostRef.current.classList.toggle("drag-ghost-near-edge", isNearEdge);
        }
        if (edgeIndicatorRef.current) {
          edgeIndicatorRef.current.style.opacity = isNearEdge ? "1" : "0";
        }
        const zone = findDropZone(e.clientX, e.clientY);
        setHighlight(zone);
        return;
      }

      if (!start) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;

      // 閾値超過 → カスタムドラッグモード開始
      draggingRef.current = true;
      dragStartRef.current = null;

      const state = useExplorerStore.getState();
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0];
      const entries = activeTab.searchResults ?? activeTab.entries;
      const index = start.index;

      const indices =
        activeTab.selectedIndices.size > 0 && activeTab.selectedIndices.has(index)
          ? Array.from(activeTab.selectedIndices)
          : [index];
      const dragEntries = indices.map((i) => entries[i]).filter(Boolean);
      const paths = dragEntries.map((de) => de.path);
      if (paths.length === 0) {
        draggingRef.current = false;
        return;
      }

      dragPathsRef.current = paths;
      document.body.classList.add("file-dragging");

      // ゴースト表示
      setDragGhostPaths({
        paths,
        names: dragEntries.map((de) => de.name),
        isDirs: dragEntries.map((de) => de.is_dir),
        extensions: dragEntries.map((de) => de.extension),
      });

      // 外部ドラッグ用アイコンをバックグラウンド生成
      externalDragIconRef.current = null;
      const firstEntry = dragEntries[0];
      const PREVIEW_IMG_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "ico"]);
      const thumbStore = useThumbnailStore.getState();
      const iconStore = useIconStore.getState();
      const cachedThumb = thumbStore.getThumbnail(firstEntry.path, 128);
      const previewSrc = cachedThumb || (!firstEntry.is_dir && PREVIEW_IMG_EXTS.has(firstEntry.extension)
        ? convertFileSrc(firstEntry.path) : null);
      const iconKey = firstEntry.is_dir ? "__directory__" : firstEntry.extension;
      const iconSrc = iconStore.largeIcons[iconKey] || iconStore.icons[iconKey] || null;
      generateDragIcon({
        previewSrc,
        iconSrc,
        count: paths.length,
      }).then((p) => {
        externalDragIconRef.current = p;
      });

      // サジェスト表示（300ms後）
      const extensions = dragEntries
        .filter((de) => !de.is_dir)
        .map((de) => de.extension)
        .filter((ext, i, arr) => ext && arr.indexOf(ext) === i);

      suggestionTimerRef.current = window.setTimeout(() => {
        useSuggestionStore
          .getState()
          .fetchSuggestions(extensions, activeTab.path, paths)
          .then(() => {
            useSuggestionStore.getState().show(e.clientX, e.clientY);
          });
      }, 300);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (draggingRef.current && dragPathsRef.current.length > 0) {
        // カスタムドラッグ中のmouseup → 内部ドロップ実行
        handleNativeDrop(dragPathsRef.current, e.clientX, e.clientY);
        useSuggestionStore.getState().hide();
        cleanupDrag();
        return;
      }
      dragStartRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [cleanupDrag]);

  // クリップボードからファイル生成
  const handleClipboardToFile = useCallback(
    async (dirPath: string) => {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          // 画像を優先チェック
          const imageType = item.types.find((t) => t.startsWith("image/"));
          if (imageType) {
            const blob = await item.getType(imageType);
            const buffer = await blob.arrayBuffer();
            const data = Array.from(new Uint8Array(buffer));
            const ext =
              imageType.split("/")[1] === "jpeg" ? "jpg" : imageType.split("/")[1] || "png";
            const createdPath: string = await invoke("write_clipboard_file", {
              dir: dirPath,
              data,
              extension: ext,
            });
            useUndoStore.getState().pushAction({
              type: "create_file",
              entries: [{ sourcePath: "", destPath: createdPath }],
            });
            toast.success(t.panel.clipboardImageCreated);
            await loadDirectory(dirPath, false);
            return;
          }

          // テキスト
          if (item.types.includes("text/plain")) {
            const blob = await item.getType("text/plain");
            const text = await blob.text();
            // ファイルパスっぽい文字列はスキップ
            if (
              text.trim().startsWith("/") ||
              text.trim().match(/^[A-Za-z]:\\/) ||
              text.trim().startsWith("\\\\")
            ) {
              return;
            }
            if (!text.trim()) return;
            const data = Array.from(new TextEncoder().encode(text));
            const createdPath: string = await invoke("write_clipboard_file", {
              dir: dirPath,
              data,
              extension: "txt",
            });
            useUndoStore.getState().pushAction({
              type: "create_file",
              entries: [{ sourcePath: "", destPath: createdPath }],
            });
            toast.success(t.panel.clipboardTextCreated);
            await loadDirectory(dirPath, false);
            return;
          }
        }
      } catch {
        // クリップボードアクセス失敗時は何もしない
      }
    },
    [loadDirectory, t.panel.clipboardImageCreated, t.panel.clipboardTextCreated],
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

      // カーソル移動系キーでカーソルを可視化（マウス操作後の非表示状態から復帰）
      if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End", " "].includes(e.key)) {
        useExplorerStore.getState().setCursorVisible(true);
      }

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
          if (e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            // OSクリップボード/内部クリップボードのファイルを先に試行
            // ファイルがなければ画像/テキストのファイル生成にフォールバック
            clipboardPaste().then((handled) => {
              if (!handled) {
                handleClipboardToFile(activeTab.path).catch((err: unknown) => {
                  toast.error(
                    `${t.panel.fileOperationFailed}: ${err instanceof Error ? err.message : String(err)}`,
                  );
                });
              }
            });
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
        case "k":
          if (e.ctrlKey) {
            e.preventDefault();
            useCommandPaletteStore.getState().open();
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
              .catch((err) => toast.error(`${getTranslation().panel.undoFailed}: ${err}`));
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
              .catch((err) => toast.error(`${getTranslation().panel.redoFailed}: ${err}`));
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
    handleClipboardToFile,
    t.panel.fileOperationFailed,
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

      {/* AI Organizer inline panel */}
      {showAiPanel && <AiOrganizer tabId={tab.id} />}

      {/* Rule suggestion banner */}
      <RuleSuggestionBanner />

      {/* Pattern suggestion banner */}
      <PatternSuggestionBanner currentPath={tab.path} />

      {/* File list */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto overflow-x-auto"
        data-drop-zone="panel-bg"
        data-panel-path={tab.path}
        onMouseDown={handleRubberBandMouseDown}
        onClick={(e) => {
          // ラバーバンド操作後のclickは選択解除しない
          if (rubberBandJustFinishedRef.current) return;
          // ファイル行以外（空白エリア・グリッドgap等）をクリックしたら選択・カーソル解除
          if (!(e.target as HTMLElement).closest?.("[data-file-path]")) {
            clearSelection();
            setCursor(-1);
          }
        }}
        onContextMenu={handleBgContextMenu}
      >
        {/* Column headers (details mode only, sticky) */}
        {viewMode === "details" && (
          <ColumnHeader
            sortKey={tab.sortKey}
            sortOrder={tab.sortOrder}
            onSort={setSort}
            onAutoFit={handleAutoFit}
          />
        )}
        {(tab.loading || tab.searching) && (
          <div className="flex items-center justify-center h-full text-[#999] gap-2">
            <Loader className="w-4 h-4 animate-spin" />
            {tab.searching ? t.panel.searching : t.panel.loading}
          </div>
        )}
        {tab.error && (
          <div className="flex items-center justify-center h-full text-red-600 px-4 text-sm animate-slide-up">
            {tab.error}
          </div>
        )}
        {!tab.loading && !tab.searching && !tab.error && displayEntries.length === 0 && (
          <div className="flex items-center justify-center h-full text-[#999] animate-fade-in">
            {tab.searchResults !== null ? t.panel.noResults : t.panel.emptyFolder}
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
                cursorVisible={cursorVisible}
                isSelected={tab.selectedIndices.has(index)}
                isRenaming={index === tab.renamingIndex}
                isCut={cutPaths.has(entry.path)}
                onNavigate={handleNavigate}
                onSelect={() => toggleSelection(index)}
                onSelectRange={(toIndex) => selectRange(tab.cursorIndex, toIndex)}
                onCursor={(i) => setCursor(i)}
                onContextMenu={handleContextMenu}
                onCommitRename={commitRename}
                onCommitRenameAndNext={commitRenameAndNext}
                onCancelRename={cancelRename}
                onFileMouseDown={handleFileMouseDown}
                onClearSelection={clearSelection}
                selectedCount={tab.selectedIndices.size}
                onStartRename={startRename}
                maxFileSize={maxFileSize}
              />
            ))
          ) : (
            <GridView
              entries={displayEntries}
              cursorIndex={tab.cursorIndex}
              cursorVisible={cursorVisible}
              selectedIndices={tab.selectedIndices}
              renamingIndex={tab.renamingIndex}
              cutPaths={cutPaths}
              onNavigate={handleNavigate}
              onSelect={toggleSelection}
              onSelectRange={selectRange}
              onCursor={setCursor}
              onContextMenu={handleContextMenu}
              onCommitRename={commitRename}
              onCommitRenameAndNext={commitRenameAndNext}
              onCancelRename={cancelRename}
              onFileMouseDown={handleFileMouseDown}
              onClearSelection={clearSelection}
              onStartRename={startRename}
            />
          ))}
      </div>

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

      {/* ラバーバンド選択矩形 */}
      {rubberBandRect && rubberBandRect.width > 0 && rubberBandRect.height > 0 && (
        <div
          className="fixed pointer-events-none z-[100]"
          style={{
            left: rubberBandRect.left,
            top: rubberBandRect.top,
            width: rubberBandRect.width,
            height: rubberBandRect.height,
            backgroundColor: "rgba(var(--accent-rgb), 0.12)",
            border: "1px solid rgba(var(--accent-rgb), 0.5)",
            borderRadius: 2,
          }}
        />
      )}

      {/* カスタムドラッグゴースト（Explorer風） */}
      {dragGhostPaths &&
        (() => {
          const ext = dragGhostPaths.extensions[0];
          const isDir = dragGhostPaths.isDirs[0];
          const path = dragGhostPaths.paths[0];
          const count = dragGhostPaths.paths.length;

          // プレビュー可能な画像拡張子
          const PREVIEW_EXTS = new Set([
            "png",
            "jpg",
            "jpeg",
            "gif",
            "webp",
            "bmp",
            "svg",
            "avif",
            "ico",
          ]);
          // サムネイルキャッシュ or ブラウザ表示可能画像
          const cachedThumb = useThumbnailStore.getState().getThumbnail(path, 128);
          const previewSrc =
            cachedThumb || (!isDir && PREVIEW_EXTS.has(ext) ? convertFileSrc(path) : null);

          return (
            <div
              ref={dragGhostRef}
              className="fixed z-[9999] pointer-events-none"
              style={{ left: -9999, top: -9999, transform: "translate(-50%, -55%)" }}
            >
              <div className="relative inline-block">
                {previewSrc ? (
                  <>
                    {/* サムネイルプレビュー + スタック */}
                    {count > 2 && (
                      <div
                        className="drag-ghost-card absolute inset-0 translate-x-1.5 translate-y-1.5 bg-white border border-[#d0d0d0] rounded shadow-sm transition-[border-color,box-shadow] duration-150"
                        style={{ zIndex: 1 }}
                      />
                    )}
                    {count > 1 && (
                      <div
                        className="drag-ghost-card absolute inset-0 translate-x-[3px] translate-y-[3px] bg-white border border-[#d0d0d0] rounded shadow-sm transition-[border-color,box-shadow] duration-150"
                        style={{ zIndex: 2 }}
                      />
                    )}
                    <div
                      className="drag-ghost-card relative bg-white border border-[#d0d0d0] rounded shadow p-1 transition-[border-color,box-shadow] duration-150"
                      style={{ zIndex: 3 }}
                    >
                      <img
                        src={previewSrc}
                        alt=""
                        className="block rounded-sm"
                        style={{ maxWidth: 120, maxHeight: 120, objectFit: "contain" }}
                        draggable={false}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {/* アイコン表示 + スタック */}
                    {count > 2 && (
                      <div
                        className="drag-ghost-card absolute w-12 h-12 bg-white border border-[#d0d0d0] rounded-lg shadow-sm transition-[border-color,box-shadow] duration-150"
                        style={{ left: 8, top: 8 }}
                      />
                    )}
                    {count > 1 && (
                      <div
                        className="drag-ghost-card absolute w-12 h-12 bg-white border border-[#d0d0d0] rounded-lg shadow-sm transition-[border-color,box-shadow] duration-150"
                        style={{ left: 4, top: 4 }}
                      />
                    )}
                    <div className="drag-ghost-card relative w-12 h-12 flex items-center justify-center bg-white border border-[#d0d0d0] rounded-lg shadow transition-[border-color,box-shadow] duration-150">
                      {(() => {
                        const iconKey = isDir ? "__directory__" : ext;
                        const store = useIconStore.getState();
                        const iconUrl = store.largeIcons[iconKey] || store.icons[iconKey];
                        if (iconUrl)
                          return (
                            <img src={iconUrl} alt="" className="w-8 h-8" draggable={false} />
                          );
                        return (
                          <span className="text-2xl leading-none">
                            {isDir ? "\uD83D\uDCC1" : "\uD83D\uDCC4"}
                          </span>
                        );
                      })()}
                    </div>
                  </>
                )}
                {/* 個数バッジ */}
                {count > 1 && (
                  <span
                    className="absolute -top-2 -right-2 text-[10px] bg-[var(--accent)] text-white rounded-full w-[18px] h-[18px] flex items-center justify-center font-semibold shadow-sm"
                    style={{ zIndex: 10 }}
                  >
                    {count}
                  </span>
                )}
                {/* ウィンドウ外ドラッグインジケーター */}
                <div
                  ref={edgeIndicatorRef}
                  className="absolute -bottom-7 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1 bg-[var(--accent)] text-white text-xs font-medium rounded shadow-md whitespace-nowrap opacity-0 transition-opacity duration-150"
                  style={{ zIndex: 10 }}
                >
                  <span>↗</span>
                  <span>外部へドロップ</span>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
