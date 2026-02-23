import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Copy,
  FileType,
  FolderOpen,
  Layers,
  Loader2,
  MoveRight,
  Settings,
  Sparkles,
  Trash2,
  Wand2,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { type AiExecutionResult, type AiSuggestedAction, useAiStore } from "../../stores/aiStore";
import { useExplorerStore } from "../../stores/panelStore";
import { useUndoStore } from "../../stores/undoStore";

interface AiOrganizerProps {
  tabId: string;
}

export function AiOrganizer({ tabId }: AiOrganizerProps) {
  const dialogOpen = useAiStore((s) => s.dialogOpen);
  const dialogTabId = useAiStore((s) => s.dialogTabId);
  const dialogFolderPath = useAiStore((s) => s.dialogFolderPath);
  const phase = useAiStore((s) => s.phase);
  const closeDialog = useAiStore((s) => s.closeDialog);
  const [collapsed, setCollapsed] = useState(false);

  // このタブのAIダイアログでなければ非表示
  if (!dialogOpen || dialogTabId !== tabId || !dialogFolderPath) return null;

  const folderName = dialogFolderPath.split("\\").filter(Boolean).pop() || dialogFolderPath;

  return (
    <div className="border-b border-[#e0e0e0] bg-[#fafafa] shrink-0 animate-slide-down">
      {/* タイトルバー */}
      <div className="flex items-center h-8 px-3 border-b border-[#e5e5e5] bg-gradient-to-r from-purple-50 to-[#fafafa]">
        <Sparkles className="w-3.5 h-3.5 text-purple-500 mr-1.5" />
        <span className="font-medium text-xs text-[#1a1a1a] flex-1 truncate">
          AI Auto-Organize — {folderName}
        </span>
        <button
          className="p-0.5 rounded hover:bg-[#e0e0e0] text-[#999] transition-colors mr-1"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "展開" : "折りたたむ"}
        >
          {collapsed ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          className="p-0.5 rounded hover:bg-[#e0e0e0] text-[#999] transition-colors"
          onClick={closeDialog}
          title="閉じる"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* フェーズ別コンテンツ（折りたたみ時は非表示） */}
      {!collapsed && (
        <div className="max-h-[50vh] flex flex-col">
          {phase === "input" && <InputPhase />}
          {phase === "plan" && <PlanPhase />}
          {phase === "preview" && <PreviewPhase />}
          {phase === "results" && <ResultsPhase />}
        </div>
      )}
    </div>
  );
}

// === プログレス表示 ===

const PHASE1_STEPS = [
  { key: "scan", label: "ファイルをスキャン" },
  { key: "api", label: "AIが整理プランを作成" },
  { key: "done", label: "プラン完成" },
];

const PHASE2_STEPS = [
  { key: "scan", label: "ファイルをスキャン" },
  { key: "assign", label: "ファイルを振り分け" },
  { key: "done", label: "振り分け完了" },
];

function ProgressIndicator({ color = "purple" }: { color?: "purple" | "blue" }) {
  const progress = useAiStore((s) => s.progress);
  const loading = useAiStore((s) => s.loading);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [loading]);

  if (!loading) return null;

  const steps = color === "purple" ? PHASE1_STEPS : PHASE2_STEPS;
  const currentStepKey = progress?.step || "scan";
  const currentStepIndex = steps.findIndex((s) => s.key === currentStepKey);

  const bgColor = color === "blue" ? "bg-blue-50" : "bg-purple-50";
  const barColor = color === "blue" ? "bg-blue-500" : "bg-purple-500";
  const spinnerColor = color === "blue" ? "text-blue-500" : "text-purple-500";
  const activeText = color === "blue" ? "text-blue-700" : "text-purple-700";

  const batchInfo =
    progress?.step === "assign" && progress.total > 1
      ? ` (${progress.current}/${progress.total})`
      : "";

  const detail = progress?.detail || "";

  const percentage =
    currentStepIndex >= 0 ? Math.round(((currentStepIndex + 1) / steps.length) * 100) : 33;

  const formatTime = (sec: number) => {
    if (sec < 60) return `${sec}秒`;
    return `${Math.floor(sec / 60)}分${sec % 60}秒`;
  };

  return (
    <div className={`${bgColor} rounded-lg px-3 py-2 space-y-1.5`}>
      <div className="space-y-0.5">
        {steps.map((step, i) => {
          const isDone = currentStepKey === "done";
          const isComplete = isDone || i < currentStepIndex;
          const isCurrent = !isDone && i === currentStepIndex;

          return (
            <div key={step.key}>
              <div className="flex items-center gap-1.5">
                {isComplete ? (
                  <Check className="w-3 h-3 text-green-500 shrink-0" />
                ) : isCurrent ? (
                  <Loader2 className={`w-3 h-3 animate-spin ${spinnerColor} shrink-0`} />
                ) : (
                  <div className="w-3 h-3 rounded-full border-2 border-[#d0d0d0] shrink-0" />
                )}
                <span
                  className={`text-[11px] ${
                    isComplete
                      ? "text-green-600 line-through"
                      : isCurrent
                        ? `${activeText} font-medium`
                        : "text-[#bbb]"
                  }`}
                >
                  {step.label}
                  {isCurrent && step.key === "assign" ? batchInfo : ""}
                </span>
              </div>
              {isCurrent && detail && (
                <div className="ml-[18px] text-[10px] text-[#999] truncate">{detail}</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 bg-white/60 rounded-full h-1">
          <div
            className={`${barColor} h-1 rounded-full transition-all duration-700`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-[10px] text-[#999] tabular-nums">{formatTime(elapsed)}</span>
      </div>
    </div>
  );
}

// === プリセット定義 ===

const PRESETS = [
  {
    label: "おまかせ整理",
    icon: Wand2,
    instruction: "__auto__",
    description: "AIがフォルダの中身を見て最適な整理を提案",
    color: "bg-gradient-to-r from-purple-500 to-pink-500 text-white",
    featured: true,
  },
  {
    label: "種類別に整理",
    icon: FileType,
    instruction:
      "ファイルを拡張子の種類ごとにサブフォルダに整理して。画像はImages、ドキュメントはDocuments、動画はVideos、音楽はMusic、その他はOthersのようにわかりやすくまとめて。",
    description: "画像・文書・動画などサブフォルダへ",
    color: "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100",
    featured: false,
  },
  {
    label: "古いファイル整理",
    icon: Clock,
    instruction: "3ヶ月以上前のファイルをOldフォルダに移動して。フォルダは対象外にして。",
    description: "3ヶ月以上前のファイルをOldへ",
    color: "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100",
    featured: false,
  },
  {
    label: "重複ファイル整理",
    icon: Layers,
    instruction:
      "ファイル名に (1)、(2)、コピー、Copy などが含まれるコピーと思われるファイルを探して、Duplicatesフォルダに移動して。",
    description: "コピー(1)等の重複ファイルをまとめる",
    color: "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100",
    featured: false,
  },
  {
    label: "散らかり一掃",
    icon: FolderOpen,
    instruction:
      "ダウンロードしたまま放置されていそうなファイル（.exe, .msi, .zip, .tmp, .log）をCleanupフォルダに移動して整理して。",
    description: "一時ファイル・インストーラーを整理",
    color: "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100",
    featured: false,
  },
];

// === Input Phase ===

function InputPhase() {
  const userInstructions = useAiStore((s) => s.userInstructions);
  const setUserInstructions = useAiStore((s) => s.setUserInstructions);
  const generatePlan = useAiStore((s) => s.generatePlan);
  const loading = useAiStore((s) => s.loading);
  const error = useAiStore((s) => s.error);
  const hasApiKey = useAiStore((s) => s.hasApiKey);
  const openSettings = useAiStore((s) => s.openSettings);
  const closeDialog = useAiStore((s) => s.closeDialog);
  const [showCustom, setShowCustom] = useState(false);

  const handleGenerate = useCallback(() => {
    if (!userInstructions.trim() || loading) return;
    generatePlan();
  }, [userInstructions, loading, generatePlan]);

  const handlePreset = useCallback(
    (instruction: string) => {
      if (loading || !hasApiKey) return;
      setUserInstructions(instruction);
      setTimeout(() => {
        useAiStore.getState().generatePlan();
      }, 0);
    },
    [loading, hasApiKey, setUserInstructions],
  );

  const featured = PRESETS.find((p) => p.featured);
  const others = PRESETS.filter((p) => !p.featured);

  return (
    <>
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {!showCustom ? (
          <>
            {/* おまかせ整理ボタン */}
            {featured && (
              <button
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all ${featured.color} shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed`}
                onClick={() => handlePreset(featured.instruction)}
                disabled={loading || !hasApiKey}
              >
                <div className="p-1.5 bg-white/20 rounded-lg">
                  <featured.icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-sm">{featured.label}</div>
                  <div className="text-xs opacity-80">{featured.description}</div>
                </div>
                {loading && <Loader2 className="w-4 h-4 animate-spin ml-auto" />}
              </button>
            )}

            {/* プリセットチップ */}
            <div className="grid grid-cols-2 gap-1.5">
              {others.map((preset) => (
                <button
                  key={preset.label}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-left text-xs transition-all ${preset.color} disabled:opacity-50 disabled:cursor-not-allowed`}
                  onClick={() => handlePreset(preset.instruction)}
                  disabled={loading || !hasApiKey}
                >
                  <preset.icon className="w-3.5 h-3.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium text-[11px]">{preset.label}</div>
                    <div className="opacity-60 truncate text-[10px]">{preset.description}</div>
                  </div>
                </button>
              ))}
            </div>

            <button
              className="w-full text-xs text-[#999] hover:text-[#666] py-1 transition-colors"
              onClick={() => setShowCustom(true)}
            >
              自分で指示を書く →
            </button>
          </>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-[#666]">自由に指示を入力</label>
              <button
                className="text-[10px] text-purple-500 hover:text-purple-700 transition-colors"
                onClick={() => setShowCustom(false)}
              >
                ← プリセットに戻る
              </button>
            </div>
            <textarea
              value={userInstructions}
              onChange={(e) => setUserInstructions(e.target.value)}
              placeholder={`好きなように指示してください:\n「PDFだけDocumentsに移動して」\n「この中の画像をまとめたい」`}
              className="w-full h-24 px-3 py-2 text-sm border border-[#d0d0d0] rounded-lg resize-none focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-300/30"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  handleGenerate();
                }
              }}
            />
            <div className="text-[10px] text-[#bbb] mt-0.5">Ctrl+Enter で生成</div>
          </div>
        )}

        {!hasApiKey && (
          <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            APIキーが未設定です。「設定」からClaude APIキーを入力してください。
          </div>
        )}

        <ProgressIndicator color="purple" />

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="flex justify-between px-3 py-2 border-t border-[#e5e5e5] shrink-0">
        <button
          className="flex items-center gap-1 px-2 py-1 text-xs text-[#666] hover:bg-[#f0f0f0] rounded transition-colors"
          onClick={openSettings}
        >
          <Settings className="w-3 h-3" />
          設定
        </button>
        <div className="flex gap-2">
          <button
            className="px-3 py-1 text-xs bg-[#f0f0f0] hover:bg-[#e0e0e0] rounded border border-[#d0d0d0] text-[#1a1a1a] transition-colors"
            onClick={closeDialog}
          >
            閉じる
          </button>
          {showCustom && (
            <button
              className="flex items-center gap-1 px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 rounded text-white transition-colors disabled:opacity-50"
              onClick={handleGenerate}
              disabled={loading || !userInstructions.trim() || !hasApiKey}
            >
              <Sparkles className="w-3 h-3" />
              {loading ? "作成中..." : "プラン作成"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// === Plan Phase ===

function PlanPhase() {
  const plan = useAiStore((s) => s.organizationPlan);
  const loading = useAiStore((s) => s.loading);
  const error = useAiStore((s) => s.error);
  const approvePlan = useAiStore((s) => s.approvePlan);
  const goBack = useAiStore((s) => s.goBack);

  if (!plan) return null;

  const totalTokens = plan.estimated_input_tokens + plan.estimated_output_tokens;

  return (
    <>
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {/* プランサマリー */}
        <div className="bg-purple-50 rounded-lg p-2.5 border border-purple-100">
          <div className="flex items-center gap-1.5 mb-1">
            <ClipboardList className="w-3.5 h-3.5 text-purple-500" />
            <span className="font-semibold text-xs text-purple-700">整理プラン</span>
          </div>
          <p className="text-xs text-[#555] leading-relaxed">{plan.summary}</p>
        </div>

        {/* カテゴリ一覧 */}
        {plan.categories.length > 0 ? (
          <div className="space-y-1">
            {plan.categories.map((cat) => (
              <div
                key={cat.folder_name}
                className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg border border-[#e8e8e8] bg-white hover:bg-[#f5f5f5] transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5 text-[#0078d4] mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-medium text-[#1a1a1a]">{cat.folder_name}/</div>
                  <div className="text-[10px] text-[#888]">{cat.description}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-[#999] text-center py-3">整理の必要がないようです</div>
        )}

        {/* 見積もり情報 */}
        <div className="flex items-center gap-3 text-[10px] text-[#999] border-t border-[#f0f0f0] pt-2">
          <span>📊 {plan.file_count.toLocaleString()}件</span>
          <span>📝 ~{totalTokens.toLocaleString()}トークン</span>
          <span>💰 ~${plan.estimated_cost_usd.toFixed(3)}</span>
        </div>

        <ProgressIndicator color="blue" />

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="flex justify-between px-3 py-2 border-t border-[#e5e5e5] shrink-0">
        <button
          className="flex items-center gap-1 px-2 py-1 text-xs text-[#666] hover:bg-[#f0f0f0] rounded transition-colors"
          onClick={goBack}
          disabled={loading}
        >
          <ArrowLeft className="w-3 h-3" />
          戻る
        </button>
        <button
          className="flex items-center gap-1 px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 rounded text-white transition-colors disabled:opacity-50"
          onClick={approvePlan}
          disabled={loading || plan.categories.length === 0}
        >
          {loading ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              振り分け中...
            </>
          ) : (
            <>
              <ArrowRight className="w-3 h-3" />
              この計画で整理
            </>
          )}
        </button>
      </div>
    </>
  );
}

// === Preview Phase ===

function PreviewPhase() {
  const suggestedActions = useAiStore((s) => s.suggestedActions);
  const removeAction = useAiStore((s) => s.removeAction);
  const executeActions = useAiStore((s) => s.executeActions);
  const executing = useAiStore((s) => s.executing);
  const error = useAiStore((s) => s.error);
  const goBack = useAiStore((s) => s.goBack);

  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(suggestedActions.map((_, i) => i)),
  );

  const toggleSelect = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === suggestedActions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(suggestedActions.map((_, i) => i)));
    }
  };

  const handleRemove = (index: number) => {
    removeAction(index);
    setSelected((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      }
      return next;
    });
  };

  const handleExecute = () => {
    executeActions(Array.from(selected));
  };

  if (suggestedActions.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-6 text-xs text-[#999] gap-2">
          <Sparkles className="w-6 h-6 text-[#ddd]" />
          <span>該当するファイルが見つかりませんでした</span>
        </div>
        <div className="flex justify-end px-3 py-2 border-t border-[#e5e5e5] shrink-0">
          <button
            className="flex items-center gap-1 px-3 py-1 text-xs bg-[#f0f0f0] hover:bg-[#e0e0e0] rounded border border-[#d0d0d0] text-[#1a1a1a] transition-colors"
            onClick={goBack}
          >
            <ArrowLeft className="w-3 h-3" />
            プランに戻る
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#f0f0f0]">
          <span className="text-[11px] text-[#666]">
            {suggestedActions.length} 件のアクション提案
          </span>
          <button
            className="text-[11px] text-[#0078d4] hover:text-[#005a9e] transition-colors"
            onClick={toggleAll}
          >
            {selected.size === suggestedActions.length ? "すべて解除" : "すべて選択"}
          </button>
        </div>

        {/* アクション一覧 */}
        <div className="divide-y divide-[#f0f0f0]">
          {suggestedActions.map((action, i) => (
            <ActionItem
              key={`${action.file_path}-${i}`}
              action={action}
              checked={selected.has(i)}
              onToggle={() => toggleSelect(i)}
              onRemove={() => handleRemove(i)}
            />
          ))}
        </div>

        {error && (
          <div className="mx-3 my-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="flex justify-between px-3 py-2 border-t border-[#e5e5e5] shrink-0">
        <button
          className="flex items-center gap-1 px-2 py-1 text-xs text-[#666] hover:bg-[#f0f0f0] rounded transition-colors"
          onClick={goBack}
          disabled={executing}
        >
          <ArrowLeft className="w-3 h-3" />
          プランに戻る
        </button>
        <button
          className="flex items-center gap-1 px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 rounded text-white transition-colors disabled:opacity-50"
          onClick={handleExecute}
          disabled={executing || selected.size === 0}
        >
          {executing ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              実行中...
            </>
          ) : (
            <>
              <ArrowRight className="w-3 h-3" />
              {selected.size}件を実行
            </>
          )}
        </button>
      </div>
    </>
  );
}

function ActionItem({
  action,
  checked,
  onToggle,
  onRemove,
}: {
  action: AiSuggestedAction;
  checked: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const actionIcon =
    action.action_type === "delete" ? (
      <Trash2 className="w-3 h-3" />
    ) : action.action_type === "copy" ? (
      <Copy className="w-3 h-3" />
    ) : (
      <MoveRight className="w-3 h-3" />
    );

  const badgeColor =
    action.action_type === "delete"
      ? "bg-red-100 text-red-700"
      : action.action_type === "copy"
        ? "bg-green-100 text-green-700"
        : "bg-blue-100 text-blue-700";

  const destName = action.action_dest ? action.action_dest.split("\\").filter(Boolean).pop() : null;

  return (
    <div
      className={`flex items-start gap-2 px-3 py-2 group hover:bg-white transition-colors ${
        !checked ? "opacity-50" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 shrink-0 accent-purple-600"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-[#1a1a1a] truncate">{action.file_name}</span>
          <span
            className={`flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded ${badgeColor} shrink-0`}
          >
            {actionIcon}
            {action.action_type === "move"
              ? "移動"
              : action.action_type === "copy"
                ? "コピー"
                : "削除"}
          </span>
        </div>
        {destName && <div className="text-[10px] text-[#666] truncate">→ {destName}</div>}
        <div className="text-[9px] text-[#999] italic truncate">{action.reason}</div>
      </div>

      <button
        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-[#999] hover:text-red-500 transition-all shrink-0"
        onClick={onRemove}
        title="除外"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// === Results Phase ===

function ResultsPhase() {
  const executionResults = useAiStore((s) => s.executionResults);
  const closeDialog = useAiStore((s) => s.closeDialog);
  const reset = useAiStore((s) => s.reset);

  const results = executionResults || [];
  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  // Undo 登録（マウント時に一度だけ）
  useEffect(() => {
    if (succeeded.length === 0) return;

    const moveEntries = succeeded
      .filter((r) => r.action_type === "move" && r.dest_path)
      .map((r) => ({ sourcePath: r.file_path, destPath: r.dest_path! }));

    if (moveEntries.length > 0) {
      useUndoStore.getState().pushAction({
        type: "move",
        entries: moveEntries,
      });
    }

    const copyEntries = succeeded
      .filter((r) => r.action_type === "copy" && r.dest_path)
      .map((r) => ({ sourcePath: r.file_path, destPath: r.dest_path! }));

    if (copyEntries.length > 0) {
      useUndoStore.getState().pushAction({
        type: "copy",
        entries: copyEntries,
      });
    }

    const deleteEntries = succeeded
      .filter((r) => r.action_type === "delete")
      .map((r) => ({ sourcePath: r.file_path, destPath: "" }));

    if (deleteEntries.length > 0) {
      useUndoStore.getState().pushAction({
        type: "delete",
        entries: deleteEntries,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [succeeded.filter, succeeded.length]);

  const handleDone = () => {
    closeDialog();
    useExplorerStore.getState().refreshDirectory();
  };

  const handleRetry = () => {
    reset();
  };

  return (
    <>
      <div className="flex-1 overflow-auto">
        {/* サマリー */}
        <div className="px-3 py-2 border-b border-[#f0f0f0]">
          <div className="flex items-center gap-3 text-xs">
            {succeeded.length > 0 && (
              <span className="text-green-600 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                {succeeded.length}件 成功
              </span>
            )}
            {failed.length > 0 && (
              <span className="text-red-500 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" />
                {failed.length}件 失敗
              </span>
            )}
          </div>
        </div>

        {/* 結果一覧 */}
        <div className="divide-y divide-[#f0f0f0]">
          {results.map((result, i) => (
            <ResultItem key={i} result={result} />
          ))}
        </div>
      </div>

      <div className="flex justify-between px-3 py-2 border-t border-[#e5e5e5] shrink-0">
        <button
          className="px-2 py-1 text-xs text-[#666] hover:bg-[#f0f0f0] rounded transition-colors"
          onClick={handleRetry}
        >
          別の指示を試す
        </button>
        <button
          className="px-4 py-1 text-xs bg-[#0078d4] hover:bg-[#005a9e] rounded text-white transition-colors"
          onClick={handleDone}
        >
          完了
        </button>
      </div>
    </>
  );
}

function ResultItem({ result }: { result: AiExecutionResult }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      {result.success ? (
        <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-[#1a1a1a] truncate">{result.file_name}</div>
        {result.success && result.dest_path && (
          <div className="text-[9px] text-[#999] truncate">→ {result.dest_path}</div>
        )}
        {!result.success && result.error && (
          <div className="text-[9px] text-red-500">{result.error}</div>
        )}
      </div>
    </div>
  );
}
