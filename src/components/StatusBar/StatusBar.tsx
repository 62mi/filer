import { PanelRightClose, PanelRightOpen, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "../../i18n";
import { useAiStore } from "../../stores/aiStore";
import { useExplorerStore } from "../../stores/panelStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { formatFileSize } from "../../utils/format";
import { calculateQuickTidiness, getScoreColor, getStars } from "../../utils/tidiness";
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
  const openSettings = useAiStore((s) => s.openSettings);

  const entries = tab.entries;
  const selectedIndices = tab.selectedIndices;

  const totalFiles = entries.filter((e) => !e.is_dir).length;
  const totalDirs = entries.filter((e) => e.is_dir).length;
  const selectedCount = selectedIndices.size;

  const selectedSize = Array.from(selectedIndices).reduce(
    (acc, idx) => acc + (entries[idx]?.size ?? 0),
    0,
  );

  const totalItems = entries.length;

  // 煩雑度スコア: Rust結果があればそれを使用、なければフロントエンド即時計算
  const tidiness = useMemo(() => {
    if (tab.path === "home:" || entries.length === 0) return null;
    return tab.tidinessScore ?? calculateQuickTidiness(entries);
  }, [tab.path, entries, tab.tidinessScore]);

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
      className="flex items-center px-3 text-[#666] bg-[#f9f9f9] border-t border-[#e5e5e5] select-none shrink-0"
      style={{ height: statusBarHeight, fontSize: uiFontSize }}
    >
      <span>
        {totalItems} {t.statusBar.items} ({totalDirs} {t.statusBar.folders}, {totalFiles}{" "}
        {t.statusBar.files})
      </span>

      {selectedCount > 0 && (
        <span key={selectedCount} className="animate-fade-in flex items-center">
          <span className="mx-2 text-[#ccc]">|</span>
          <span className="text-[#0078d4]">
            {selectedCount} {t.statusBar.selected} ({formatFileSize(selectedSize)})
          </span>
        </span>
      )}

      {tidiness && (
        <span className="animate-fade-in flex items-center">
          <span className="mx-2 text-[#ccc]">|</span>
          <span
            className={`${getScoreColor(tidiness.total)} cursor-default`}
            title={`${t.statusBar.tidiness.score}: ${tidiness.total}/100\n${getStars(tidiness.total)}\n\n${t.statusBar.tidiness.extTypes}: ${tidiness.ext_score} (${tidiness.ext_count}${t.statusBar.tidiness.types})\n${t.statusBar.tidiness.oldFiles}: ${tidiness.age_score}\n${t.statusBar.tidiness.fileCount}: ${tidiness.count_score} (${tidiness.file_count}${t.statusBar.tidiness.count})\n${t.statusBar.tidiness.nestDepth}: ${tidiness.nest_score}${tidiness.max_depth > 0 ? ` (${t.statusBar.tidiness.depth}${tidiness.max_depth})` : ""}`}
          >
            {getStars(tidiness.total)} {tidiness.total}
          </span>
        </span>
      )}

      <div className="flex-1" />

      {/* コピーキュー進捗インジケータ */}
      <CopyQueueMiniIndicator />

      {/* AI使用量バジェットインジケータ */}
      {hasApiKey && (
        <button
          className={`flex items-center gap-1 px-1.5 py-0.5 mr-2 rounded hover:bg-[#e0e0e0] transition-colors ${getBudgetColor()}`}
          onClick={openSettings}
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
        className="p-0.5 mr-2 rounded hover:bg-[#e0e0e0] text-[#999] transition-colors"
        onClick={onTogglePreview}
        title={t.statusBar.togglePreview}
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
