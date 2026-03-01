import { X } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "../../i18n";
import { useExplorerStore } from "../../stores/panelStore";
import type { FileTypeCategory, FilterState, ModifiedRange, SizeRange } from "../../types";
import { cn } from "../../utils/cn";
import { DropdownCheckItem, DropdownRadioItem, FilterDropdown } from "./FilterDropdown";

const TYPE_CATEGORIES: FileTypeCategory[] = [
  "folder",
  "image",
  "video",
  "audio",
  "document",
  "archive",
];
const SIZE_RANGES: SizeRange[] = ["small", "medium", "large", "huge"];
const MODIFIED_RANGES: ModifiedRange[] = [
  "today",
  "yesterday",
  "thisWeek",
  "thisMonth",
  "thisYear",
  "older",
];

interface FilterChipsProps {
  filter: FilterState;
}

export function FilterChips({ filter }: FilterChipsProps) {
  const t = useTranslation();
  const toggleTypeFilter = useExplorerStore((s) => s.toggleTypeFilter);
  const setSizeFilter = useExplorerStore((s) => s.setSizeFilter);
  const setModifiedFilter = useExplorerStore((s) => s.setModifiedFilter);
  const clearFilters = useExplorerStore((s) => s.clearFilters);

  const [openDropdown, setOpenDropdown] = useState<"type" | "size" | "modified" | null>(null);

  const toggleDropdown = useCallback((name: "type" | "size" | "modified") => {
    setOpenDropdown((prev) => (prev === name ? null : name));
  }, []);
  const closeDropdown = useCallback(() => setOpenDropdown(null), []);

  const hasActiveFilter =
    filter.types.length > 0 || filter.sizeRange !== null || filter.modifiedRange !== null;

  const typeLabel =
    filter.types.length > 0 ? `${t.filter.type}(${filter.types.length})` : t.filter.type;

  const sizeLabel = filter.sizeRange ? t.filter.sizes[filter.sizeRange] : t.filter.size;

  const modifiedLabel = filter.modifiedRange
    ? t.filter.modifiedRanges[filter.modifiedRange]
    : t.filter.modified;

  return (
    <div className="flex items-center gap-1">
      {/* 種類チップ */}
      <div className="relative">
        <ChipButton
          label={typeLabel}
          active={filter.types.length > 0}
          onClick={() => toggleDropdown("type")}
          onClear={
            filter.types.length > 0
              ? () => {
                  for (const t of filter.types) toggleTypeFilter(t);
                }
              : undefined
          }
        />
        <FilterDropdown open={openDropdown === "type"} onClose={closeDropdown}>
          {TYPE_CATEGORIES.map((cat) => (
            <DropdownCheckItem
              key={cat}
              label={t.filter.types[cat]}
              checked={filter.types.includes(cat)}
              onChange={() => toggleTypeFilter(cat)}
            />
          ))}
        </FilterDropdown>
      </div>

      {/* サイズチップ */}
      <div className="relative">
        <ChipButton
          label={sizeLabel}
          active={filter.sizeRange !== null}
          onClick={() => toggleDropdown("size")}
          onClear={filter.sizeRange !== null ? () => setSizeFilter(null) : undefined}
        />
        <FilterDropdown open={openDropdown === "size"} onClose={closeDropdown}>
          {SIZE_RANGES.map((range) => (
            <DropdownRadioItem
              key={range}
              label={t.filter.sizes[range]}
              selected={filter.sizeRange === range}
              onChange={() => {
                setSizeFilter(filter.sizeRange === range ? null : range);
                closeDropdown();
              }}
            />
          ))}
        </FilterDropdown>
      </div>

      {/* 更新日チップ */}
      <div className="relative">
        <ChipButton
          label={modifiedLabel}
          active={filter.modifiedRange !== null}
          onClick={() => toggleDropdown("modified")}
          onClear={filter.modifiedRange !== null ? () => setModifiedFilter(null) : undefined}
        />
        <FilterDropdown open={openDropdown === "modified"} onClose={closeDropdown}>
          {MODIFIED_RANGES.map((range) => (
            <DropdownRadioItem
              key={range}
              label={t.filter.modifiedRanges[range]}
              selected={filter.modifiedRange === range}
              onChange={() => {
                setModifiedFilter(filter.modifiedRange === range ? null : range);
                closeDropdown();
              }}
            />
          ))}
        </FilterDropdown>
      </div>

      {/* 全クリアボタン */}
      {hasActiveFilter && (
        <button
          className="flex items-center gap-0.5 px-2 h-7 text-[12px] text-[#888] hover:text-[#555] transition-colors"
          onClick={clearFilters}
          title={t.filter.clear}
        >
          <X className="w-3 h-3" />
          {t.filter.clear}
        </button>
      )}
    </div>
  );
}

interface ChipButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  onClear?: () => void;
}

function ChipButton({ label, active, onClick, onClear }: ChipButtonProps) {
  return (
    <button
      className={cn(
        "flex items-center gap-1 rounded-full px-3 h-7 text-[12px] border transition-colors",
        active
          ? "bg-[rgba(var(--accent-rgb),0.1)] border-[rgba(var(--accent-rgb),0.3)] text-[var(--accent)]"
          : "border-[#d0d0d0] text-[#666] hover:bg-[#f0f0f0]",
      )}
      onClick={onClick}
    >
      <span>{label}</span>
      {active && onClear ? (
        <span
          className="ml-0.5 hover:bg-[rgba(var(--accent-rgb),0.2)] rounded-full p-0.5"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          onKeyDown={() => {}}
        >
          <X className="w-3 h-3" />
        </span>
      ) : (
        <ChevronIcon />
      )}
    </button>
  );
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="w-3 h-3 opacity-60"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M3 5l3 3 3-3" />
    </svg>
  );
}
