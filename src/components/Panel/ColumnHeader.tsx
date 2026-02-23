import { ArrowDown, ArrowUp } from "lucide-react";
import type { SortKey, SortOrder } from "../../types";
import { cn } from "../../utils/cn";

interface ColumnHeaderProps {
  sortKey: SortKey;
  sortOrder: SortOrder;
  onSort: (key: SortKey) => void;
}

function SortIndicator({ active, order }: { active: boolean; order: SortOrder }) {
  if (!active) return null;
  return order === "asc" ? (
    <ArrowUp className="w-3 h-3 ml-1" />
  ) : (
    <ArrowDown className="w-3 h-3 ml-1" />
  );
}

export function ColumnHeader({ sortKey, sortOrder, onSort }: ColumnHeaderProps) {
  const columns: { key: SortKey; label: string; className: string }[] = [
    { key: "name", label: "Name", className: "flex-1" },
    { key: "modified", label: "Date modified", className: "w-28 justify-end ml-4" },
    { key: "extension", label: "Type", className: "w-32 ml-4" },
    { key: "size", label: "Size", className: "w-20 justify-end ml-2" },
  ];

  return (
    <div className="flex items-center h-7 px-2 text-xs font-semibold text-[#666] bg-[#fafafa] border-b border-[#e5e5e5] select-none">
      <div className="w-6 shrink-0" />
      {columns.map((col) => (
        <button
          key={col.key}
          className={cn(
            "flex items-center shrink-0 hover:text-[#1a1a1a] transition-colors",
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
