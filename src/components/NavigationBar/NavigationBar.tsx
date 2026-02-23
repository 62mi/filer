import { ArrowLeft, ArrowRight, ArrowUp, Eye, EyeOff, RotateCw, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useExplorerStore } from "../../stores/panelStore";
import { cn } from "../../utils/cn";

function NavButton({
  onClick,
  title,
  disabled,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className={cn(
        "p-1.5 rounded hover:bg-[#e8e8e8] transition-colors text-[#666]",
        disabled && "opacity-30 cursor-not-allowed hover:bg-transparent",
      )}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function NavigationBar() {
  const tab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0]);
  const showHidden = useExplorerStore((s) => s.showHidden);
  const navigateBack = useExplorerStore((s) => s.navigateBack);
  const navigateForward = useExplorerStore((s) => s.navigateForward);
  const navigateUp = useExplorerStore((s) => s.navigateUp);
  const loadDirectory = useExplorerStore((s) => s.loadDirectory);
  const toggleHidden = useExplorerStore((s) => s.toggleHidden);
  const searchFn = useExplorerStore((s) => s.search);
  const clearSearch = useExplorerStore((s) => s.clearSearch);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(tab.path);
  const [searchValue, setSearchValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    setEditValue(tab.path);
    setSearchValue("");
  }, [tab.path]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSubmit = () => {
    setEditing(false);
    if (editValue.trim() && editValue.trim() !== tab.path) {
      loadDirectory(editValue.trim());
    }
  };

  const segments = tab.path.split(/[\\/]/).filter(Boolean);

  return (
    <div className="flex items-center gap-1 h-10 px-2 bg-white border-b border-[#e5e5e5] shrink-0">
      {/* Navigation buttons */}
      <NavButton onClick={navigateBack} title="Back (Alt+Left)" disabled={tab.historyIndex <= 0}>
        <ArrowLeft className="w-4 h-4" />
      </NavButton>
      <NavButton
        onClick={navigateForward}
        title="Forward (Alt+Right)"
        disabled={tab.historyIndex >= tab.history.length - 1}
      >
        <ArrowRight className="w-4 h-4" />
      </NavButton>
      <NavButton onClick={navigateUp} title="Up (Alt+Up)">
        <ArrowUp className="w-4 h-4" />
      </NavButton>
      <NavButton onClick={() => loadDirectory(tab.path, false)} title="Refresh (F5)">
        <RotateCw className="w-3.5 h-3.5" />
      </NavButton>

      {/* Address bar */}
      <div className="flex-1 mx-1">
        {editing ? (
          <input
            ref={inputRef}
            className="w-full h-7 px-2 text-sm bg-white text-[#1a1a1a] border border-[#0078d4] rounded outline-none"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") {
                setEditValue(tab.path);
                setEditing(false);
              }
            }}
          />
        ) : (
          <div
            className="flex items-center h-7 px-2 text-sm bg-[#f0f0f0] rounded cursor-text hover:bg-[#e8e8e8] overflow-hidden"
            onClick={() => setEditing(true)}
          >
            {segments.map((segment, i) => {
              const segmentPath = segments.slice(0, i + 1).join("\\");
              const fullPath =
                segmentPath.length === 2 && segmentPath[1] === ":"
                  ? segmentPath + "\\"
                  : segmentPath;
              return (
                <span key={i} className="flex items-center shrink-0">
                  {i > 0 && <span className="mx-1 text-[#999] text-xs">{"\u203A"}</span>}
                  <button
                    className="hover:text-[#0078d4] hover:underline transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      loadDirectory(fullPath);
                    }}
                  >
                    {segment}
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Hidden files toggle */}
      <NavButton onClick={toggleHidden} title="Toggle hidden files (Ctrl+H)">
        {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-[#999]" />}
      </NavButton>

      {/* Search bar */}
      <div className="flex items-center h-7 w-52 px-2 bg-[#f0f0f0] rounded text-sm focus-within:bg-white focus-within:border focus-within:border-[#0078d4]">
        <Search className="w-3.5 h-3.5 mr-2 shrink-0 text-[#999]" />
        <input
          ref={searchRef}
          className="flex-1 bg-transparent outline-none text-[#1a1a1a] placeholder-[#999] min-w-0"
          placeholder={`Search ${tab.path.split("\\").pop() || ""}`}
          value={searchValue}
          onChange={(e) => {
            setSearchValue(e.target.value);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            const val = e.target.value;
            debounceRef.current = setTimeout(() => {
              if (val.trim()) {
                searchFn(val);
              } else {
                clearSearch();
              }
            }, 300);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              setSearchValue("");
              clearSearch();
              searchRef.current?.blur();
            }
          }}
        />
        {searchValue && (
          <button
            className="text-[#999] hover:text-[#666] ml-1"
            onClick={() => {
              setSearchValue("");
              clearSearch();
            }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
