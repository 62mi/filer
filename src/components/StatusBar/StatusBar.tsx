import { PanelRightOpen, PanelRightClose } from "lucide-react";
import { useExplorerStore } from "../../stores/panelStore";
import { formatFileSize } from "../../utils/format";

interface StatusBarProps {
  onTogglePreview: () => void;
  previewOpen: boolean;
}

export function StatusBar({ onTogglePreview, previewOpen }: StatusBarProps) {
  const tab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0]);

  const entries = tab.entries;
  const selectedIndices = tab.selectedIndices;

  const totalFiles = entries.filter((e) => !e.is_dir).length;
  const totalDirs = entries.filter((e) => e.is_dir).length;
  const selectedCount = selectedIndices.size;

  const selectedSize = Array.from(selectedIndices).reduce(
    (acc, idx) => acc + (entries[idx]?.size ?? 0),
    0
  );

  const totalItems = entries.length;

  return (
    <div className="flex items-center h-6 px-3 text-xs text-[#666] bg-[#f9f9f9] border-t border-[#e5e5e5] select-none shrink-0">
      <span>
        {totalItems} items ({totalDirs} folders, {totalFiles} files)
      </span>

      {selectedCount > 0 && (
        <>
          <span className="mx-2 text-[#ccc]">|</span>
          <span className="text-[#0078d4]">
            {selectedCount} selected ({formatFileSize(selectedSize)})
          </span>
        </>
      )}

      <div className="flex-1" />

      <button
        className="p-0.5 mr-2 rounded hover:bg-[#e0e0e0] text-[#999] transition-colors"
        onClick={onTogglePreview}
        title="Toggle preview (Alt+P)"
      >
        {previewOpen ? (
          <PanelRightClose className="w-3.5 h-3.5" />
        ) : (
          <PanelRightOpen className="w-3.5 h-3.5" />
        )}
      </button>

      <span className="text-[#999] truncate max-w-md">{tab.path}</span>
    </div>
  );
}
