import { Folder } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { useIconStore } from "../../stores/iconStore";
import { getGridCellHeight, getGridCellWidth, useSettingsStore } from "../../stores/settingsStore";
import { useThumbnailStore } from "../../stores/thumbnailStore";
import type { FileEntry } from "../../types";
import { cn } from "../../utils/cn";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);

export interface GridCellProps {
  entry: FileEntry;
  index: number;
  isCursor: boolean;
  isSelected: boolean;
  isRenaming: boolean;
  isCut: boolean;
  isDropTarget: boolean;
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
}

export const GridCell = memo(function GridCell({
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
}: GridCellProps) {
  const [renameValue, setRenameValue] = useState(entry.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const cellRef = useRef<HTMLDivElement>(null);

  const slowClickTimerRef = useRef<number | null>(null);
  const wasSelectedOnMouseDownRef = useRef(false);
  const didDragRef = useRef(false);

  const gridIconSize = useSettingsStore((s) => s.gridIconSize);
  const gridFontSize = useSettingsStore((s) => s.gridFontSize);
  const cellWidth = getGridCellWidth({ gridIconSize });
  const cellHeight = getGridCellHeight({ gridIconSize });

  const isImage = !entry.is_dir && IMAGE_EXTS.has(entry.extension);
  const THUMB_SIZE = 128;
  const thumbKey = isImage ? `${entry.path}\0${THUMB_SIZE}` : "";
  const fetchThumbnails = useThumbnailStore((s) => s.fetchThumbnails);
  const hasThumbnail = useThumbnailStore((s) => (isImage ? !!s.thumbnails[thumbKey] : false));
  const isPending = useThumbnailStore((s) => (isImage ? s.pending.has(thumbKey) : false));

  // IntersectionObserver: ビューポートに入ったらサムネイル取得
  useEffect(() => {
    if (!isImage || hasThumbnail || isPending) return;
    const el = cellRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchThumbnails([entry.path], THUMB_SIZE);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isImage, hasThumbnail, isPending, entry.path, fetchThumbnails]);

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

  const thumbnail = useThumbnailStore((s) => (isImage ? s.thumbnails[thumbKey] : undefined));
  const largeIcon = useIconStore(
    (s) => s.largeIcons[entry.is_dir ? "__directory__" : entry.extension],
  );

  // Icon size scales with gridIconSize
  const iconDisplaySize = Math.max(24, Math.min(gridIconSize * 0.6, 64));

  return (
    <div
      ref={cellRef}
      className={cn(
        "flex flex-col items-center justify-center p-1 rounded cursor-default select-none",
        "transition-[background-color,opacity] duration-100 ease-out",
        isCursor && !isSelected && "bg-[#e8e8e8]",
        isSelected && !isCursor && "bg-[#cce8ff]",
        isCursor && isSelected && "bg-[#b4d8f0]",
        !isCursor && !isSelected && "hover:bg-[#f5f5f5]",
        isCut && "opacity-50",
        isDropTarget && !isFolderizeTarget && "bg-[#cce8ff] outline outline-1 outline-[#0078d4]",
        isFolderizeTarget && "folderize-target",
      )}
      style={{ width: cellWidth, height: cellHeight }}
      draggable={!isRenaming}
      onMouseDown={(e) => {
        didDragRef.current = false;
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
          if (wasSelectedOnMouseDownRef.current && !didDragRef.current && selectedCount <= 1) {
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
      {/* Icon / Thumbnail area */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: gridIconSize, height: gridIconSize }}
      >
        {isFolderizeTarget ? (
          <Folder
            className="folderize-icon text-[#0078d4]"
            style={{ width: iconDisplaySize, height: iconDisplaySize }}
          />
        ) : isImage && thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            style={{ maxWidth: gridIconSize, maxHeight: gridIconSize, objectFit: "contain" }}
            draggable={false}
          />
        ) : largeIcon ? (
          <img
            src={largeIcon}
            alt=""
            style={{ width: iconDisplaySize, height: iconDisplaySize, imageRendering: "pixelated" }}
            draggable={false}
          />
        ) : entry.is_dir ? (
          <Folder
            className="text-amber-500"
            style={{ width: iconDisplaySize, height: iconDisplaySize }}
          />
        ) : (
          <div
            className="bg-[#e8e8e8] rounded"
            style={{ width: iconDisplaySize, height: iconDisplaySize }}
          />
        )}
      </div>

      {/* Filename */}
      {isRenaming ? (
        <input
          ref={inputRef}
          className="w-full h-5 px-1 bg-white border border-[#0078d4] rounded outline-none text-center"
          style={{ fontSize: gridFontSize }}
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
        <span
          className="w-full text-center overflow-hidden px-0.5"
          style={{
            fontSize: gridFontSize,
            lineHeight: 1.3,
            display: "-webkit-box",
            WebkitLineClamp: gridIconSize >= 96 ? 3 : 2,
            WebkitBoxOrient: "vertical",
            wordBreak: "break-all",
          }}
          title={entry.name}
        >
          {entry.name}
        </span>
      )}
    </div>
  );
});
