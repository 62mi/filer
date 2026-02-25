import { Check, ChevronDown, ChevronUp, X, Zap } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "../../i18n";
import { useExplorerStore } from "../../stores/panelStore";
import { type RuleSuggestion, useRuleSuggestionStore } from "../../stores/ruleSuggestionStore";

export function RuleSuggestionBanner() {
  const t = useTranslation();
  const suggestions = useRuleSuggestionStore((s) => s.suggestions);
  const acceptSuggestion = useRuleSuggestionStore((s) => s.acceptSuggestion);
  const dismissSuggestion = useRuleSuggestionStore((s) => s.dismissSuggestion);
  const alwaysDoThis = useRuleSuggestionStore((s) => s.alwaysDoThis);
  const tab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0]);

  const [expanded, setExpanded] = useState(true);

  // 現在のフォルダのサジェストのみ表示
  const folderSuggestions = suggestions.filter((s) => {
    const fileFolder = s.filePath.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
    const tabFolder = tab.path.replace(/\\/g, "/");
    return fileFolder.toLowerCase() === tabFolder.toLowerCase();
  });

  if (folderSuggestions.length === 0) return null;

  const visibleSuggestions = expanded ? folderSuggestions.slice(0, 3) : [];
  const hiddenCount = folderSuggestions.length - 3;

  const handleAccept = async (s: RuleSuggestion) => {
    await acceptSuggestion(s);
    // ディレクトリをリフレッシュ
    useExplorerStore.getState().refreshDirectory();
  };

  const handleAlways = async (s: RuleSuggestion) => {
    await alwaysDoThis(s);
    useExplorerStore.getState().refreshDirectory();
  };

  const destName = (dest: string | null) => {
    if (!dest) return "";
    return dest.split("\\").filter(Boolean).pop() || dest;
  };

  return (
    <div className="border-b border-amber-200 bg-amber-50/80 shrink-0 animate-slide-down">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span className="text-xs font-medium text-amber-700 flex-1">
          {t.ruleSuggestion.ruleMatch} — {folderSuggestions.length}
          {t.ruleSuggestion.suggestions}
        </span>
        <button
          className="p-0.5 rounded hover:bg-amber-200/50 text-amber-500 transition-colors"
          onClick={() => setExpanded(!expanded)}
          title={expanded ? t.common.collapse : t.common.expand}
        >
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          className="p-0.5 rounded hover:bg-amber-200/50 text-amber-400 transition-colors"
          onClick={() => folderSuggestions.forEach((s) => dismissSuggestion(s.filePath))}
          title={t.common.hideAll}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* サジェストリスト */}
      {expanded && (
        <div className="px-3 pb-2 space-y-1.5">
          {visibleSuggestions.map((s) => (
            <div
              key={s.filePath}
              className="flex items-center gap-2 bg-white/70 rounded px-2.5 py-1.5 border border-amber-200/60"
            >
              {/* ファイル名 + アクション説明 */}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-[#1a1a1a] truncate font-medium">{s.fileName}</div>
                <div className="text-[10px] text-amber-600 truncate">
                  ルール「{s.ruleName}」: {t.ruleLabels.actions[s.actionType] || s.actionType}
                  {s.actionDest && ` → ${destName(s.actionDest)}`}
                </div>
              </div>

              {/* アクションボタン */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-amber-500 hover:bg-amber-600 text-white rounded transition-colors"
                  onClick={() => handleAccept(s)}
                  title="サジェストを受理"
                >
                  <Check className="w-3 h-3" />
                  {t.ruleLabels.actions[s.actionType] || s.actionType}
                </button>
                <button
                  className="px-2 py-0.5 text-[10px] text-amber-600 hover:bg-amber-100 rounded transition-colors"
                  onClick={() => handleAlways(s)}
                  title="今後このルールを自動実行する"
                >
                  {t.ruleSuggestion.alwaysExecute}
                </button>
                <button
                  className="p-0.5 rounded hover:bg-amber-100 text-amber-400 transition-colors"
                  onClick={() => dismissSuggestion(s.filePath)}
                  title="無視"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}

          {hiddenCount > 0 && (
            <div className="text-[10px] text-amber-500 text-center py-0.5">
              +{hiddenCount} {t.ruleSuggestion.moreSuggestions}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
