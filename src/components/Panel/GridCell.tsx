import { Check, Folder, Loader } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { useIconStore } from "../../stores/iconStore";
import { getGridCellHeight, getGridCellWidth, useSettingsStore } from "../../stores/settingsStore";
import { PDF_EXTS, PSD_EXTS, useThumbnailStore, VIDEO_EXTS } from "../../stores/thumbnailStore";
import type { FileEntry } from "../../types";
import { cn } from "../../utils/cn";
import { GOOGLE_DOCS_EXTENSIONS } from "../../utils/previewConstants";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);

export interface GridCellProps {
  entry: FileEntry;
  index: number;
  isCursor: boolean;
  cursorVisible: boolean;
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
}

export const GridCell = memo(function GridCell({
  entry,
  index,
  isCursor,
  cursorVisible,
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
  const isVideo = !entry.is_dir && VIDEO_EXTS.has(entry.extension);
  const isPdf = !entry.is_dir && PDF_EXTS.has(entry.extension);
  const isPsd = !entry.is_dir && PSD_EXTS.has(entry.extension);
  const isGoogleDocs = !entry.is_dir && GOOGLE_DOCS_EXTENSIONS.has(entry.extension);
  const hasThumbnailMedia = isImage || isVideo || isPdf || isPsd || isGoogleDocs;
  const THUMB_SIZE = 128;
  const thumbKey = hasThumbnailMedia ? `${entry.path}\0${THUMB_SIZE}` : "";
  const fetchThumbnails = useThumbnailStore((s) => s.fetchThumbnails);
  const fetchVideoThumbnail = useThumbnailStore((s) => s.fetchVideoThumbnail);
  const fetchPsdThumbnail = useThumbnailStore((s) => s.fetchPsdThumbnail);
  const fetchGoogleDocsThumbnails = useThumbnailStore((s) => s.fetchGoogleDocsThumbnails);
  const markFailed = useThumbnailStore((s) => s.markFailed);
  const hasThumbnail = useThumbnailStore((s) =>
    hasThumbnailMedia ? !!s.thumbnails[thumbKey] : false,
  );
  const isPending = useThumbnailStore((s) => (hasThumbnailMedia ? s.pending.has(thumbKey) : false));
  const isFailed = useThumbnailStore((s) => (hasThumbnailMedia ? s.failed.has(thumbKey) : false));

  // IntersectionObserver: ビューポートに入ったらサムネイル取得
  useEffect(() => {
    if (!hasThumbnailMedia || hasThumbnail || isPending || isFailed) return;
    const el = cellRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          if (isImage) {
            fetchThumbnails([entry.path], THUMB_SIZE);
          } else if (isGoogleDocs) {
            fetchGoogleDocsThumbnails([entry.path], THUMB_SIZE);
          } else if (isPsd) {
            fetchPsdThumbnail(entry.path, THUMB_SIZE);
          } else {
            fetchVideoThumbnail(entry.path, THUMB_SIZE);
          }
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    hasThumbnailMedia,
    isImage,
    isGoogleDocs,
    isPsd,
    hasThumbnail,
    isPending,
    isFailed,
    entry.path,
    fetchThumbnails,
    fetchVideoThumbnail,
    fetchPsdThumbnail,
    fetchGoogleDocsThumbnails,
  ]);

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

  const thumbnail = useThumbnailStore((s) =>
    hasThumbnailMedia ? s.thumbnails[thumbKey] : undefined,
  );
  const largeIcon = useIconStore(
    (s) => s.largeIcons[entry.is_dir ? "__directory__" : entry.extension],
  );
  const smallIcon = useIconStore((s) => (hasThumbnailMedia ? s.icons[entry.extension] : undefined));

  // Icon size scales with gridIconSize
  const iconDisplaySize = Math.max(24, Math.round(gridIconSize * 0.9));

  return (
    <div
      ref={cellRef}
      className={cn(
        "flex flex-col items-center justify-center gap-1 p-1 rounded-lg cursor-default select-none relative",
        "transition-[background-color,opacity] duration-100 ease-out",
        isCursor && cursorVisible && !isSelected && "bg-[#e8e8e8]",
        isSelected && !(isCursor && cursorVisible) && "bg-[rgba(var(--accent-rgb),0.15)]",
        isCursor && cursorVisible && isSelected && "bg-[rgba(var(--accent-rgb),0.25)]",
        !(isCursor && cursorVisible) && !isSelected && "hover:bg-[#f5f5f5]",
        isCut && "opacity-50",
      )}
      data-mid-click-path={entry.is_dir ? entry.path : undefined}
      data-drop-zone="file-row"
      data-file-path={entry.path}
      data-is-dir={entry.is_dir ? "true" : "false"}
      style={{ width: cellWidth, height: cellHeight }}
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
            onSelect(index);
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
    >
      {/* Selection checkmark */}
      {isSelected && (
        <span className="absolute top-1 right-1 w-4 h-4 bg-[rgb(var(--accent-rgb))] rounded-full flex items-center justify-center check-pop z-10">
          <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
        </span>
      )}
      {/* Icon / Thumbnail area */}
      <div
        className="relative flex items-center justify-center shrink-0"
        style={{ width: gridIconSize, height: gridIconSize }}
      >
        {hasThumbnailMedia && thumbnail ? (
          <>
            <img
              src={thumbnail}
              alt=""
              className="rounded-sm animate-fade-in"
              style={{
                maxWidth: gridIconSize,
                maxHeight: gridIconSize,
                objectFit: "contain",
                filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.2))",
              }}
              draggable={false}
              onError={isGoogleDocs ? () => markFailed(entry.path, THUMB_SIZE) : undefined}
            />
            {smallIcon && !isImage && (
              <img
                src={smallIcon}
                alt=""
                className="absolute bottom-0 right-0 w-5 h-5"
                style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))" }}
                draggable={false}
              />
            )}
          </>
        ) : largeIcon ? (
          <img
            src={largeIcon}
            alt=""
            style={{ width: iconDisplaySize, height: iconDisplaySize }}
            draggable={false}
          />
        ) : entry.is_dir ? (
          <Folder
            className="text-amber-500"
            style={{ width: iconDisplaySize, height: iconDisplaySize }}
          />
        ) : (
          <div
            className="flex items-center justify-center"
            style={{ width: iconDisplaySize, height: iconDisplaySize }}
          >
            {isPending && (
              <Loader className="text-[#aaa] animate-spin" style={{ width: iconDisplaySize * 0.35, height: iconDisplaySize * 0.35 }} />
            )}
          </div>
        )}
      </div>

      {/* Filename */}
      {isRenaming ? (
        <input
          ref={inputRef}
          className="w-full h-5 px-1 bg-white border border-[var(--accent)] rounded outline-none text-center"
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
