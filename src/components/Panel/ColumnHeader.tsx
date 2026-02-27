import { ArrowUp } from "lucide-react";
import { useCallback, useRef } from "react";
import { useTranslation } from "../../i18n";
import type { ColumnWidths } from "../../stores/settingsStore";
import { getTotalColumnWidth, useSettingsStore } from "../../stores/settingsStore";
import type { SortKey, SortOrder } from "../../types";
import { cn } from "../../utils/cn";

interface ColumnHeaderProps {
  sortKey: SortKey;
  sortOrder: SortOrder;
  onSort: (key: SortKey) => void;
  onAutoFit?: (key: keyof ColumnWidths) => void;
}

const MIN_WIDTHS: Record<keyof ColumnWidths, number> = {
  name: 120,
  modified: 80,
  extension: 60,
  size: 60,
};

function SortIndicator({ active, order }: { active: boolean; order: SortOrder }) {
  if (!active) return null;
  return (
    <ArrowUp
      className={cn(
        "w-3 h-3 ml-1 shrink-0 transition-transform duration-200",
        order === "desc" && "rotate-180",
      )}
    />
  );
}

function ResizeHandle({
  widthKey,
  onResizeStart,
  onAutoFit,
}: {
  widthKey: keyof ColumnWidths;
  onResizeStart: (e: React.MouseEvent, key: keyof ColumnWidths) => void;
  onAutoFit?: (key: keyof ColumnWidths) => void;
}) {
  return (
    <div
      className="absolute top-1 bottom-1 right-0 w-[6px] cursor-col-resize z-10 group flex items-center justify-center"
      onMouseDown={(e) => onResizeStart(e, widthKey)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onAutoFit?.(widthKey);
      }}
    >
      <div className="w-px h-full bg-[#e0e0e0] group-hover:bg-[var(--accent)] transition-colors" />
    </div>
  );
}

function HeaderCell({
  sortKey,
  currentSortKey,
  sortOrder,
  label,
  widthKey,
  width,
  onSort,
  onResizeStart,
  onAutoFit,
}: {
  sortKey: SortKey;
  currentSortKey: SortKey;
  sortOrder: SortOrder;
  label: string;
  widthKey: keyof ColumnWidths;
  width: number;
  onSort: (key: SortKey) => void;
  onResizeStart: (e: React.MouseEvent, key: keyof ColumnWidths) => void;
  onAutoFit?: (key: keyof ColumnWidths) => void;
}) {
  return (
    <div className="relative shrink-0 h-full" style={{ width }}>
      <button
        className="flex items-center w-full h-full px-2 hover:bg-[#e8e8e8] transition-colors"
        onClick={() => onSort(sortKey)}
      >
        <span className="truncate">{label}</span>
        <SortIndicator active={currentSortKey === sortKey} order={sortOrder} />
      </button>
      <ResizeHandle widthKey={widthKey} onResizeStart={onResizeStart} onAutoFit={onAutoFit} />
    </div>
  );
}

export function ColumnHeader({ sortKey, sortOrder, onSort, onAutoFit }: ColumnHeaderProps) {
  const t = useTranslation();
  const columnHeaderHeight = useSettingsStore((s) => s.columnHeaderHeight);
  const uiFontSize = useSettingsStore((s) => s.uiFontSize);
  const columnWidths = useSettingsStore((s) => s.columnWidths);
  const setSetting = useSettingsStore((s) => s.setSetting);

  const draggingRef = useRef(false);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, widthKey: keyof ColumnWidths) => {
      e.stopPropagation();
      e.preventDefault();
      draggingRef.current = true;

      const startX = e.clientX;
      const startWidth = columnWidths[widthKey];
      const minWidth = MIN_WIDTHS[widthKey];

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        const newWidth = Math.max(minWidth, startWidth + delta);
        setSetting("columnWidths", { ...columnWidths, [widthKey]: newWidth });
      };

      const onMouseUp = () => {
        draggingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [columnWidths, setSetting],
  );

  const totalWidth = getTotalColumnWidth(columnWidths);

  return (
    <div
      className="sticky top-0 z-20 flex items-center px-2 bg-white border-b border-[#e5e5e5] select-none"
      style={{
        height: columnHeaderHeight,
        fontSize: uiFontSize,
        minWidth: totalWidth,
        color: "#444",
      }}
    >
      {/* アイコンスペーサー */}
      <div className="w-6 shrink-0" />

      <HeaderCell
        sortKey="name"
        currentSortKey={sortKey}
        sortOrder={sortOrder}
        label={t.columnHeader.name}
        widthKey="name"
        width={columnWidths.name}
        onSort={onSort}
        onResizeStart={handleResizeStart}
        onAutoFit={onAutoFit}
      />
      <HeaderCell
        sortKey="modified"
        currentSortKey={sortKey}
        sortOrder={sortOrder}
        label={t.columnHeader.modified}
        widthKey="modified"
        width={columnWidths.modified}
        onSort={onSort}
        onResizeStart={handleResizeStart}
        onAutoFit={onAutoFit}
      />
      <HeaderCell
        sortKey="extension"
        currentSortKey={sortKey}
        sortOrder={sortOrder}
        label={t.columnHeader.type}
        widthKey="extension"
        width={columnWidths.extension}
        onSort={onSort}
        onResizeStart={handleResizeStart}
        onAutoFit={onAutoFit}
      />
      <HeaderCell
        sortKey="size"
        currentSortKey={sortKey}
        sortOrder={sortOrder}
        label={t.columnHeader.size}
        widthKey="size"
        width={columnWidths.size}
        onSort={onSort}
        onResizeStart={handleResizeStart}
        onAutoFit={onAutoFit}
      />
    </div>
  );
}
