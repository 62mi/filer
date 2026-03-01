import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDirSizeStore } from "../../stores/dirSizeStore";
import { getTotalColumnWidth, useSettingsStore } from "../../stores/settingsStore";
import type { FileEntry } from "../../types";
import { cn } from "../../utils/cn";
import { getFileType } from "../../utils/fileType";
import { formatDate, formatFileSize, getSizeBarColor } from "../../utils/format";
import { FileIcon } from "./FileIcon";

interface FileRowProps {
  entry: FileEntry;
  index: number;
  isCursor: boolean;
  isSelected: boolean;
  isRenaming: boolean;
  isCut: boolean;
  onNavigate: (entry: FileEntry) => void;
  onSelect: (index: number) => void;
  onSelectRange: (toIndex: number) => void;
  onCursor: (index: number) => void;
  onContextMenu: (e: React.MouseEvent, index: number) => void;
  onCommitRename: (newName: string) => void;
  onCommitRenameAndNext: (newName: string, direction: 1 | -1) => void;
  onCancelRename: () => void;
  onFileMouseDown: (e: React.MouseEvent, index: number) => void;
  onClearSelection: () => void;
  selectedCount: number;
  onStartRename: (index: number) => void;
  maxFileSize: number;
}

export function FileRow({
  entry,
  index,
  isCursor,
  isSelected,
  isRenaming,
  isCut,
  onNavigate,
  onSelect,
  onSelectRange,
  onCursor,
  onContextMenu,
  onCommitRename,
  onCommitRenameAndNext,
  onCancelRename,
  onFileMouseDown,
  onClearSelection,
  selectedCount,
  onStartRename,
  maxFileSize,
}: FileRowProps) {
  const [renameValue, setRenameValue] = useState(entry.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Slow-click rename refs
  const slowClickTimerRef = useRef<number | null>(null);
  const wasSelectedOnMouseDownRef = useRef(false);
  const didDragRef = useRef(false);

  // Cleanup slow-click timer on unmount or when renaming starts
  useEffect(() => {
    return () => {
      if (slowClickTimerRef.current) {
        clearTimeout(slowClickTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      setRenameValue(entry.name);
      inputRef.current.focus();
      // Select name without extension
      const dotIndex = entry.name.lastIndexOf(".");
      if (dotIndex > 0 && !entry.is_dir) {
        inputRef.current.setSelectionRange(0, dotIndex);
      } else {
        inputRef.current.select();
      }
    }
  }, [isRenaming, entry.name, entry.is_dir]);

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== entry.name) {
      onCommitRename(trimmed);
    } else {
      onCancelRename();
    }
  };

  const rowHeight = useSettingsStore((s) => s.detailRowHeight);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const columnWidths = useSettingsStore((s) => s.columnWidths);

  return (
    <div
      className={cn(
        "flex items-center px-2 cursor-default select-none relative",
        "transition-[background-color,opacity,transform,box-shadow] duration-100 ease-out",
        isCursor && !isSelected && "bg-[#e8e8e8] rounded",
        isSelected && !isCursor && "bg-[rgba(var(--accent-rgb),0.15)] rounded",
        isCursor && isSelected && "bg-[rgba(var(--accent-rgb),0.25)] rounded",
        !isCursor && !isSelected && "hover:bg-[#f5f5f5] rounded",
        isCut && "opacity-50",
      )}
      data-mid-click-path={entry.is_dir ? entry.path : undefined}
      data-drop-zone="file-row"
      data-file-path={entry.path}
      data-is-dir={entry.is_dir ? "true" : "false"}
      style={{ height: rowHeight, fontSize, minWidth: getTotalColumnWidth(columnWidths) }}
      onMouseDown={(e) => {
        didDragRef.current = false;
        // 修飾キーなし・左クリック・単一選択済み・カーソル一致 の場合に記録
        wasSelectedOnMouseDownRef.current =
          e.button === 0 &&
          !e.shiftKey &&
          !e.ctrlKey &&
          !e.metaKey &&
          isSelected &&
          isCursor &&
          selectedCount <= 1;
        // ネイティブドラッグ用
        onFileMouseDown(e, index);
      }}
      onClick={(e) => {
        if (isRenaming) return;
        if (e.shiftKey) {
          onSelectRange(index);
        } else if (e.ctrlKey) {
          onCursor(index);
          onSelect(index);
        } else {
          // Slow-click rename: 既に選択済み単一アイテムを再度クリック
          if (wasSelectedOnMouseDownRef.current && !didDragRef.current && selectedCount <= 1) {
            // 既存のタイマーがあればクリア
            if (slowClickTimerRef.current) {
              clearTimeout(slowClickTimerRef.current);
            }
            slowClickTimerRef.current = window.setTimeout(() => {
              slowClickTimerRef.current = null;
              onStartRename(index);
            }, 500);
          } else {
            onClearSelection();
            onCursor(index);
          }
        }
        wasSelectedOnMouseDownRef.current = false;
      }}
      onDoubleClick={() => {
        // ダブルクリック時はslow-clickタイマーをキャンセル
        if (slowClickTimerRef.current) {
          clearTimeout(slowClickTimerRef.current);
          slowClickTimerRef.current = null;
        }
        if (!isRenaming) onNavigate(entry);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (slowClickTimerRef.current) {
          clearTimeout(slowClickTimerRef.current);
          slowClickTimerRef.current = null;
        }
        onContextMenu(e, index);
      }}
    >
      <span className="relative mr-2 shrink-0">
        <FileIcon
          isDir={entry.is_dir}
          extension={entry.extension}
          className={cn("w-4 h-4", entry.is_dir ? "text-amber-500" : "text-[#666]")}
        />
        {isSelected && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[rgb(var(--accent-rgb))] rounded-full flex items-center justify-center check-pop">
            <Check className="w-2 h-2 text-white" strokeWidth={3} />
          </span>
        )}
      </span>
      {isRenaming ? (
        <input
          ref={inputRef}
          className="h-5 px-1 text-sm bg-white border border-[var(--accent)] rounded outline-none"
          style={{ width: columnWidths.name - 8 }}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") handleRenameSubmit();
            if (e.key === "Escape") onCancelRename();
            if (e.key === "Tab") {
              e.preventDefault();
              const trimmed = renameValue.trim();
              const name = trimmed && trimmed !== entry.name ? trimmed : entry.name;
              onCommitRenameAndNext(name, e.shiftKey ? -1 : 1);
            }
          }}
        />
      ) : (
        <span className="shrink-0 truncate" style={{ width: columnWidths.name }}>
          {entry.name}
        </span>
      )}
      <span
        className="shrink-0 px-2 truncate"
        style={{ width: columnWidths.modified, color: "#888", textAlign: "left" }}
      >
        {formatDate(entry.modified)}
      </span>
      <span
        className="shrink-0 px-2 truncate"
        style={{ width: columnWidths.extension, color: "#666", textAlign: "left" }}
      >
        {getFileType(entry)}
      </span>
      <DirSizeCell entry={entry} maxFileSize={maxFileSize} width={columnWidths.size} />
    </div>
  );
}

/** サイズ列: ファイルはそのまま、フォルダは非同期計算サイズを表示 */
function DirSizeCell({
  entry,
  maxFileSize,
  width,
}: {
  entry: FileEntry;
  maxFileSize: number;
  width: number;
}) {
  const dirSize = useDirSizeStore((s) => (entry.is_dir ? s.sizes[entry.path] : undefined));
  // リクエスト済み && sizes未着 = 計算中
  const isCalculating = useDirSizeStore((s) =>
    entry.is_dir ? s.requestedPaths.has(entry.path) && !(entry.path in s.sizes) : false,
  );

  const displaySize = entry.is_dir ? dirSize : entry.size;
  const hasSize = displaySize !== undefined && (entry.is_dir || displaySize > 0);

  return (
    <span
      className="shrink-0 px-2 truncate relative overflow-hidden"
      style={{ width, color: "#666", textAlign: "left" }}
    >
      {/* サイズバー */}
      {hasSize && maxFileSize > 0 && !isCalculating && (
        <span
          className="absolute inset-y-0 right-0 opacity-20 rounded-sm"
          style={{
            width: `${(displaySize / maxFileSize) * 100}%`,
            backgroundColor: getSizeBarColor(displaySize),
          }}
        />
      )}
      <span className="relative z-10">
        {isCalculating ? "計算中…" : hasSize ? formatFileSize(displaySize) : ""}
      </span>
    </span>
  );
}
