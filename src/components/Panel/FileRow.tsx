import { useState, useRef, useEffect } from "react";
import { cn } from "../../utils/cn";
import { formatFileSize, formatDate } from "../../utils/format";
import { FileIcon } from "./FileIcon";
import { getFileType } from "../../utils/fileType";
import type { FileEntry } from "../../types";

interface FileRowProps {
  entry: FileEntry;
  index: number;
  isCursor: boolean;
  isSelected: boolean;
  isRenaming: boolean;
  isCut: boolean;
  isDropTarget: boolean;
  onNavigate: (entry: FileEntry) => void;
  onSelect: (index: number) => void;
  onCursor: (index: number) => void;
  onContextMenu: (e: React.MouseEvent, index: number) => void;
  onCommitRename: (newName: string) => void;
  onCancelRename: () => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
}

export function FileRow({
  entry,
  index,
  isCursor,
  isSelected,
  isRenaming,
  isCut,
  isDropTarget,
  onNavigate,
  onSelect,
  onCursor,
  onContextMenu,
  onCommitRename,
  onCancelRename,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: FileRowProps) {
  const [renameValue, setRenameValue] = useState(entry.name);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div
      className={cn(
        "flex items-center h-7 px-2 text-sm cursor-default select-none",
        "border-l-2 border-transparent",
        isCursor && "bg-[#e8e8e8] border-l-[#0078d4]",
        isSelected && "bg-[#cce8ff]",
        isCursor && isSelected && "bg-[#a8d4f0] border-l-[#0078d4]",
        !isCursor && !isSelected && "hover:bg-[#f0f0f0]",
        isCut && "opacity-50",
        isDropTarget && "bg-[#cce8ff] outline outline-1 outline-[#0078d4]"
      )}
      draggable={!isRenaming}
      onClick={(e) => {
        if (isRenaming) return;
        onCursor(index);
        if (e.ctrlKey) {
          onSelect(index);
        }
      }}
      onDoubleClick={() => {
        if (!isRenaming) onNavigate(entry);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, index);
      }}
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
    >
      <FileIcon
        isDir={entry.is_dir}
        extension={entry.extension}
        className={cn(
          "w-4 h-4 mr-2 shrink-0",
          entry.is_dir ? "text-amber-500" : "text-[#666]"
        )}
      />
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
          }}
        />
      ) : (
        <span className="flex-1 truncate">{entry.name}</span>
      )}
      <span className="w-28 text-right text-[#888] shrink-0 ml-4 truncate">
        {formatDate(entry.modified)}
      </span>
      <span className="w-32 text-[#666] shrink-0 ml-4 truncate">
        {getFileType(entry)}
      </span>
      <span className="w-20 text-right text-[#666] shrink-0 ml-2">
        {entry.is_dir ? "" : formatFileSize(entry.size)}
      </span>
    </div>
  );
}
