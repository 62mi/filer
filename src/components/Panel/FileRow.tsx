import { Folder } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
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
  isDropTarget: boolean;
  /** ファイル on ファイルのドロップターゲット（iOS風フォルダ化） */
  isFolderizeTarget: boolean;
  onNavigate: (entry: FileEntry) => void;
  onSelect: (index: number) => void;
  onSelectRange: (toIndex: number) => void;
  onCursor: (index: number) => void;
  onContextMenu: (e: React.MouseEvent, index: number) => void;
  onCommitRename: (newName: string) => void;
  onCommitRenameAndNext: (newName: string, direction: 1 | -1) => void;
  onCancelRename: () => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
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
  isDropTarget,
  isFolderizeTarget,
  onNavigate,
  onSelect,
  onSelectRange,
  onCursor,
  onContextMenu,
  onCommitRename,
  onCommitRenameAndNext,
  onCancelRename,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
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

  return (
    <div
      className={cn(
        "flex items-center px-2 cursor-default select-none",
        "transition-[background-color,opacity,transform,box-shadow] duration-100 ease-out",
        isCursor && !isSelected && "bg-[#e8e8e8]",
        isSelected && !isCursor && "bg-[#cce8ff]",
        isCursor && isSelected && "bg-[#b4d8f0]",
        !isCursor && !isSelected && "hover:bg-[#f5f5f5]",
        isCut && "opacity-50",
        // 通常のフォルダへのドロップ
        isDropTarget && !isFolderizeTarget && "bg-[#cce8ff] outline outline-1 outline-[#0078d4]",
        // iOS風フォルダ化ターゲット（ファイル on ファイル）
        isFolderizeTarget && "folderize-target",
      )}
      style={{ height: rowHeight, fontSize }}
      draggable={!isRenaming}
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
      onDragStart={(e) => {
        didDragRef.current = true;
        if (slowClickTimerRef.current) {
          clearTimeout(slowClickTimerRef.current);
          slowClickTimerRef.current = null;
        }
        onDragStart(e, index);
      }}
      onDragOver={(e) => onDragOver(e, index)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
    >
      {isFolderizeTarget ? (
        <Folder className="w-4 h-4 mr-2 shrink-0 folderize-icon text-[#0078d4]" />
      ) : (
        <FileIcon
          isDir={entry.is_dir}
          extension={entry.extension}
          className={cn("w-4 h-4 mr-2 shrink-0", entry.is_dir ? "text-amber-500" : "text-[#666]")}
        />
      )}
      {isRenaming ? (
        <input
          ref={inputRef}
          className="flex-1 h-5 px-1 text-sm bg-white border border-[#0078d4] rounded outline-none min-w-0"
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
        <span className="flex-1 truncate">{entry.name}</span>
      )}
      <span className="w-36 text-right text-[#888] shrink-0 ml-4 truncate">
        {formatDate(entry.modified)}
      </span>
      <span className="w-36 text-[#666] shrink-0 ml-4 truncate">{getFileType(entry)}</span>
      <span className="w-20 text-right text-[#666] shrink-0 ml-2 relative overflow-hidden">
        {!entry.is_dir && maxFileSize > 0 && (
          <span
            className="absolute inset-y-0 right-0 opacity-20 rounded-sm"
            style={{
              width: `${(entry.size / maxFileSize) * 100}%`,
              backgroundColor: getSizeBarColor(entry.size),
            }}
          />
        )}
        <span className="relative z-10">
          {entry.is_dir ? "" : formatFileSize(entry.size)}
        </span>
      </span>
    </div>
  );
}
