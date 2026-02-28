import { useCallback, useEffect, useMemo } from "react";
import { useIconStore } from "../../stores/iconStore";
import { getGridCellWidth, useSettingsStore } from "../../stores/settingsStore";
import { extractGoogleDocsPaths, extractImagePaths, extractVideoPaths, useThumbnailStore } from "../../stores/thumbnailStore";
import type { FileEntry } from "../../types";
import { GridCell } from "./GridCell";

interface GridViewProps {
  entries: FileEntry[];
  cursorIndex: number;
  selectedIndices: Set<number>;
  renamingIndex: number | null;
  cutPaths: Set<string>;
  onNavigate: (entry: FileEntry) => void;
  onSelect: (index: number) => void;
  onSelectRange: (fromIndex: number, toIndex: number) => void;
  onCursor: (index: number) => void;
  onContextMenu: (e: React.MouseEvent, index: number) => void;
  onCommitRename: (newName: string) => void;
  onCommitRenameAndNext: (newName: string, direction: 1 | -1) => void;
  onCancelRename: () => void;
  onFileMouseDown: (e: React.MouseEvent, index: number) => void;
  onClearSelection: () => void;
  onStartRename: (index: number) => void;
}

export function GridView({
  entries,
  cursorIndex,
  selectedIndices,
  renamingIndex,
  cutPaths,
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
  onStartRename,
}: GridViewProps) {
  const fetchLargeIcons = useIconStore((s) => s.fetchLargeIcons);
  const gridIconSize = useSettingsStore((s) => s.gridIconSize);
  const gridGap = useSettingsStore((s) => s.gridGap);
  const cellWidth = getGridCellWidth({ gridIconSize });

  const prefetchInBackground = useThumbnailStore((s) => s.prefetchInBackground);
  const prefetchVideosInBackground = useThumbnailStore((s) => s.prefetchVideosInBackground);
  const prefetchGoogleDocsInBackground = useThumbnailStore((s) => s.prefetchGoogleDocsInBackground);
  const cancelPrefetch = useThumbnailStore((s) => s.cancelPrefetch);
  const cancelVideoPrefetch = useThumbnailStore((s) => s.cancelVideoPrefetch);
  const cancelGoogleDocsPrefetch = useThumbnailStore((s) => s.cancelGoogleDocsPrefetch);
  const THUMB_SIZE = 128;

  // Fetch large icons (lightweight, ext-based cache)
  useEffect(() => {
    if (entries.length === 0) return;
    const exts = new Set<string>();
    exts.add("__directory__");
    for (const e of entries) {
      if (!e.is_dir && e.extension) exts.add(e.extension);
    }
    fetchLargeIcons(Array.from(exts));
  }, [entries, fetchLargeIcons]);

  // Background prefetch thumbnails for all images in folder
  const imagePaths = useMemo(() => extractImagePaths(entries), [entries]);
  const videoPaths = useMemo(() => extractVideoPaths(entries), [entries]);
  const googleDocsPaths = useMemo(() => extractGoogleDocsPaths(entries), [entries]);

  useEffect(() => {
    if (imagePaths.length === 0) return;
    prefetchInBackground(imagePaths, THUMB_SIZE);
    return () => cancelPrefetch();
  }, [imagePaths, prefetchInBackground, cancelPrefetch]);

  // Background prefetch thumbnails for videos (FFmpeg, slower)
  useEffect(() => {
    if (videoPaths.length === 0) return;
    prefetchVideosInBackground(videoPaths, THUMB_SIZE);
    return () => cancelVideoPrefetch();
  }, [videoPaths, prefetchVideosInBackground, cancelVideoPrefetch]);

  // Background prefetch Google Docs thumbnails
  useEffect(() => {
    if (googleDocsPaths.length === 0) return;
    prefetchGoogleDocsInBackground(googleDocsPaths, THUMB_SIZE);
    return () => cancelGoogleDocsPrefetch();
  }, [googleDocsPaths, prefetchGoogleDocsInBackground, cancelGoogleDocsPrefetch]);

  const handleSelectRange = useCallback(
    (toIndex: number) => onSelectRange(cursorIndex, toIndex),
    [cursorIndex, onSelectRange],
  );

  return (
    <div
      className="p-1"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, ${cellWidth}px)`,
        gap: `${gridGap}px`,
        alignContent: "start",
      }}
    >
      {entries.map((entry, index) => (
        <GridCell
          key={entry.path}
          entry={entry}
          index={index}
          isCursor={index === cursorIndex}
          isSelected={selectedIndices.has(index)}
          isRenaming={index === renamingIndex}
          isCut={cutPaths.has(entry.path)}
          onNavigate={onNavigate}
          onSelect={onSelect}
          onSelectRange={handleSelectRange}
          onCursor={onCursor}
          onContextMenu={onContextMenu}
          onCommitRename={onCommitRename}
          onCommitRenameAndNext={onCommitRenameAndNext}
          onCancelRename={onCancelRename}
          onFileMouseDown={onFileMouseDown}
          onClearSelection={onClearSelection}
          selectedCount={selectedIndices.size}
          onStartRename={onStartRename}
        />
      ))}
    </div>
  );
}
