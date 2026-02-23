import { ArrowUp } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import type { SortKey, SortOrder } from "../../types";
import { cn } from "../../utils/cn";

interface ColumnHeaderProps {
  sortKey: SortKey;
  sortOrder: SortOrder;
  onSort: (key: SortKey) => void;
}

function SortIndicator({ active, order }: { active: boolean; order: SortOrder }) {
  if (!active) return null;
  return (
    <ArrowUp
      className={cn(
        "w-3 h-3 ml-1 transition-transform duration-200",
        order === "desc" && "rotate-180",
      )}
    />
  );
}

export function ColumnHeader({ sortKey, sortOrder, onSort }: ColumnHeaderProps) {
  const columnHeaderHeight = useSettingsStore((s) => s.columnHeaderHeight);
  const uiFontSize = useSettingsStore((s) => s.uiFontSize);
  const columns: { key: SortKey; label: string; className: string }[] = [
    { key: "name", label: "名前", className: "flex-1" },
    { key: "modified", label: "更新日時", className: "w-36 justify-end ml-4" },
    { key: "extension", label: "種類", className: "w-36 ml-4" },
    { key: "size", label: "サイズ", className: "w-20 justify-end ml-2" },
  ];

  return (
    <div
      className="flex items-center px-2 text-[#444] bg-white border-b border-[#e5e5e5] select-none"
      style={{ height: columnHeaderHeight, fontSize: uiFontSize }}
    >
      <div className="w-6 shrink-0" />
      {columns.map((col, i) => (
        <button
          key={col.key}
          className={cn(
            "flex items-center shrink-0 hover:bg-[#e8e8e8] transition-colors px-1 h-full",
            i > 0 && "border-l border-[#e0e0e0]",
            col.className,
          )}
          onClick={() => onSort(col.key)}
        >
          {col.label}
          <SortIndicator active={sortKey === col.key} order={sortOrder} />
        </button>
      ))}
    </div>
  );
}
