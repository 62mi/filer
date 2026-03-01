import { useEffect, useRef } from "react";
import { cn } from "../../utils/cn";

interface FilterDropdownProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function FilterDropdown({ open, onClose, children }: FilterDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "absolute top-full left-0 mt-1 z-50 bg-white border border-[#d0d0d0] rounded-lg shadow-lg py-1 min-w-[160px]",
        "animate-fade-in",
      )}
    >
      {children}
    </div>
  );
}

interface DropdownCheckItemProps {
  label: string;
  checked: boolean;
  onChange: () => void;
}

export function DropdownCheckItem({ label, checked, onChange }: DropdownCheckItemProps) {
  return (
    <button
      className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-[13px] hover:bg-[#f0f0f0] transition-colors"
      onClick={onChange}
    >
      <span
        className={cn(
          "w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0",
          checked
            ? "bg-[var(--accent)] border-[var(--accent)] text-white"
            : "border-[#ccc]",
        )}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 6l3 3 5-5" />
          </svg>
        )}
      </span>
      <span>{label}</span>
    </button>
  );
}

interface DropdownRadioItemProps {
  label: string;
  selected: boolean;
  onChange: () => void;
}

export function DropdownRadioItem({ label, selected, onChange }: DropdownRadioItemProps) {
  return (
    <button
      className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-[13px] hover:bg-[#f0f0f0] transition-colors"
      onClick={onChange}
    >
      <span
        className={cn(
          "w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0",
          selected
            ? "border-[var(--accent)]"
            : "border-[#ccc]",
        )}
      >
        {selected && <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />}
      </span>
      <span>{label}</span>
    </button>
  );
}
