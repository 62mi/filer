import { Plus, Sparkles, X } from "lucide-react";
import { type RulePattern, useRuleStore } from "../../stores/ruleStore";

export function PatternSuggestionBanner({ currentPath }: { currentPath: string }) {
  const allPatterns = useRuleStore((s) => s.suggestedPatterns);
  const show = useRuleStore((s) => s.showPatternSuggestion);
  const dismiss = useRuleStore((s) => s.dismissPatternSuggestion);
  const createFromPattern = useRuleStore((s) => s.createRuleFromPattern);

  // 現在のフォルダに関連するパターンだけ表示
  const patterns = allPatterns.filter(
    (p) => p.source_dir.toLowerCase() === currentPath.toLowerCase(),
  );

  if (!show || patterns.length === 0) return null;

  const destName = (dest: string) => dest.split("\\").filter(Boolean).pop() || dest;

  return (
    <div className="border-b border-purple-200 bg-purple-50/60 shrink-0 animate-slide-down">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Sparkles className="w-3.5 h-3.5 text-purple-500 shrink-0" />
        <span className="text-xs font-medium text-purple-700 flex-1">
          ルール提案 — よく行う操作が見つかりました
        </span>
        <button
          className="p-0.5 rounded hover:bg-purple-200/50 text-purple-400 transition-colors"
          onClick={dismiss}
          title="非表示"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* パターンリスト */}
      <div className="px-3 pb-2 space-y-1.5">
        {patterns.map((p, i) => (
          <PatternItem
            key={`${p.extension}-${p.dest_dir}-${i}`}
            pattern={p}
            onCreateRule={() => createFromPattern(p)}
            destName={destName(p.dest_dir)}
          />
        ))}
      </div>
    </div>
  );
}

function PatternItem({
  pattern,
  onCreateRule,
  destName,
}: {
  pattern: RulePattern;
  onCreateRule: () => void;
  destName: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-white/70 rounded px-2.5 py-1.5 border border-purple-200/60">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-[#1a1a1a]">
          よく <span className="font-medium">.{pattern.extension}</span> ファイルを{" "}
          <span className="font-medium">{destName}</span> に移動しています
        </div>
        <div className="text-[10px] text-purple-500">{pattern.frequency}回の移動履歴</div>
      </div>
      <button
        className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-purple-500 hover:bg-purple-600 text-white rounded transition-colors shrink-0"
        onClick={onCreateRule}
      >
        <Plus className="w-3 h-3" />
        ルール作成
      </button>
    </div>
  );
}
