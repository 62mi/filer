import { PanelRightClose, PanelRightOpen, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "../../i18n";
import { useAiStore } from "../../stores/aiStore";
import { useDirSizeStore } from "../../stores/dirSizeStore";
import { applyFilters, useExplorerStore } from "../../stores/panelStore";
import { useSettingsStore } from "../../stores/settingsStore";

import { formatFileSize } from "../../utils/format";
import { CopyQueueMiniIndicator } from "../CopyQueue";

interface StatusBarProps {
  onTogglePreview: () => void;
  previewOpen: boolean;
}

export function StatusBar({ onTogglePreview, previewOpen }: StatusBarProps) {
  const t = useTranslation();
  const tab = useExplorerStore((s) => s.tabs.find((tt) => tt.id === s.activeTabId) || s.tabs[0]);
  const statusBarHeight = useSettingsStore((s) => s.statusBarHeight);
  const uiFontSize = useSettingsStore((s) => s.uiFontSize);
  const usageInfo = useAiStore((s) => s.usageInfo);
  const hasApiKey = useAiStore((s) => s.hasApiKey);
  const openSettings = useSettingsStore((s) => s.openSettings);

  const entries = tab.entries;
  const dirSizes = useDirSizeStore((s) => s.sizes);
  const filteredEntries = useMemo(
    () => applyFilters(entries, tab.filter, dirSizes),
    [entries, tab.filter, dirSizes],
  );
  const isFiltered =
    tab.filter.types.length > 0 ||
    tab.filter.sizeRange !== null ||
    tab.filter.modifiedRange !== null;
  const selectedIndices = tab.selectedIndices;

  const displayEntries = isFiltered ? filteredEntries : entries;
  const totalFiles = displayEntries.filter((e) => !e.is_dir).length;
  const totalDirs = displayEntries.filter((e) => e.is_dir).length;
  const selectedCount = selectedIndices.size;
  const selectedSize = Array.from(selectedIndices).reduce((acc, idx) => {
    const entry = displayEntries[idx];
    if (!entry) return acc;
    return acc + (entry.is_dir ? (dirSizes[entry.path] ?? 0) : entry.size);
  }, 0);

  const totalItems = displayEntries.length;

  // バジェットインジケータの色
  const getBudgetColor = () => {
    if (!usageInfo || !usageInfo.budget_usd) return "text-[#999]";
    const ratio = usageInfo.cost_usd / usageInfo.budget_usd;
    if (ratio >= 0.9) return "text-red-500";
    if (ratio >= 0.7) return "text-amber-500";
    return "text-green-600";
  };

  return (
    <div
      className="relative flex items-center px-3 text-[var(--chrome-text-dim)] border-t border-[var(--chrome-border)] select-none shrink-0"
      style={{
        height: statusBarHeight,
        fontSize: uiFontSize,
        background: "var(--chrome-bg)",
      }}
    >
      {/* ロード進捗バー */}
      {tab.loading && (
        <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden">
          <div className="statusbar-progress-bar" />
        </div>
      )}
      <span>
        {isFiltered && (
          <span className="text-[var(--accent)]">
            {entries.length} {t.filter.filtered}{" "}
          </span>
        )}
        {totalItems} {t.statusBar.items} ({totalDirs} {t.statusBar.folders}, {totalFiles}{" "}
        {t.statusBar.files})
      </span>

      {selectedCount > 0 && (
        <span key={selectedCount} className="animate-fade-in flex items-center">
          <span className="mx-2 text-[var(--chrome-border)]">|</span>
          <span className="text-[var(--accent)]">
            {selectedCount} {t.statusBar.selected} ({formatFileSize(selectedSize)})
          </span>
        </span>
      )}

      <div className="flex-1" />

      {/* コピーキュー進捗インジケータ */}
      <CopyQueueMiniIndicator />

      {/* AI使用量バジェットインジケータ */}
      {hasApiKey && (
        <button
          className={`flex items-center gap-1 px-1.5 py-0.5 mr-2 rounded hover:bg-[var(--chrome-hover)] transition-colors ${getBudgetColor()}`}
          onClick={() => openSettings("ai")}
          title={t.statusBar.aiUsageTooltip}
        >
          <Sparkles className="w-3 h-3" />
          {usageInfo ? (
            <span className="tabular-nums">
              ${usageInfo.cost_usd.toFixed(2)}
              {usageInfo.budget_usd !== null && (
                <span className="text-[#bbb]"> / ${usageInfo.budget_usd.toFixed(0)}</span>
              )}
            </span>
          ) : (
            <span className="text-[#bbb]">--</span>
          )}
        </button>
      )}

      <button
        className="p-0.5 mr-2 rounded hover:bg-[var(--chrome-hover)] text-[var(--chrome-text-dim)] transition-colors"
        onClick={onTogglePreview}
        title={t.statusBar.togglePreview}
      >
        {previewOpen ? (
          <PanelRightClose className="w-3.5 h-3.5" />
        ) : (
          <PanelRightOpen className="w-3.5 h-3.5" />
        )}
      </button>

      <span className="text-[var(--chrome-text-dim)] truncate max-w-md">{tab.path}</span>
    </div>
  );
}
