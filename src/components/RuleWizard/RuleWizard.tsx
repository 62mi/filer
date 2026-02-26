import { Check, ChevronDown, ChevronUp, Loader, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n";
import { type ConditionType } from "../../stores/ruleStore";
import { type GeneratedRulePreview, useRuleWizardStore } from "../../stores/ruleWizardStore";

export function RuleWizard() {
  const t = useTranslation();
  const open = useRuleWizardStore((s) => s.open);
  const folderPath = useRuleWizardStore((s) => s.folderPath);
  const messages = useRuleWizardStore((s) => s.messages);
  const rulePreview = useRuleWizardStore((s) => s.rulePreview);
  const loading = useRuleWizardStore((s) => s.loading);
  const error = useRuleWizardStore((s) => s.error);
  const closeWizard = useRuleWizardStore((s) => s.closeWizard);
  const sendMessage = useRuleWizardStore((s) => s.sendMessage);
  const confirmRule = useRuleWizardStore((s) => s.confirmRule);

  const [input, setInput] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Escape で閉じる
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWizard();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, closeWizard]);

  // チャット末尾にスクロール
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, []);

  // 開いたときに入力にフォーカス
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    await sendMessage(text);
  };

  if (!open || !folderPath) return null;

  const folderName = folderPath.split("\\").filter(Boolean).pop() || folderPath;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 animate-fade-in"
      onClick={closeWizard}
    >
      <div
        className="bg-white rounded-lg shadow-xl border border-[#e0e0e0] w-[560px] h-[520px] flex flex-col animate-fade-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* タイトルバー */}
        <div className="flex items-center h-10 px-4 border-b border-[#e5e5e5] shrink-0">
          <Sparkles className="w-4 h-4 text-purple-500 mr-2" />
          <span className="font-semibold text-sm text-[#1a1a1a] flex-1 truncate">
            {t.ruleWizard.title} — {folderName}
          </span>
          <button
            className="p-1 rounded hover:bg-[#e8e8e8] text-[#666] transition-colors"
            onClick={closeWizard}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* パス表示 */}
        <div className="px-4 py-1.5 text-[10px] text-[#999] border-b border-[#f0f0f0] truncate">
          {folderPath}
        </div>

        {/* チャットエリア */}
        <div ref={chatRef} className="flex-1 overflow-auto p-4 space-y-3">
          {/* ウェルカムメッセージ */}
          {messages.length === 0 && !loading && (
            <div className="text-center py-8 space-y-3">
              <Sparkles className="w-10 h-10 text-purple-300 mx-auto" />
              <div className="text-sm text-[#999]">{t.ruleWizard.welcomeMessage}</div>
              <div className="text-[10px] text-[#bbb] space-y-1">
                <div>{t.ruleWizard.example1}</div>
                <div>{t.ruleWizard.example2}</div>
                <div>{t.ruleWizard.example3}</div>
              </div>
            </div>
          )}

          {/* メッセージ一覧 */}
          {messages.map((msg, i) => (
            <div key={`${msg.role}-${i}`}>
              {msg.role === "user" ? (
                <div className="flex justify-end">
                  <div className="bg-[#0078d4] text-white rounded-lg rounded-br-sm px-3 py-2 text-sm max-w-[80%]">
                    {msg.content}
                  </div>
                </div>
              ) : (
                <div className="flex justify-start">
                  <div className="bg-[#f5f0ff] text-[#1a1a1a] rounded-lg rounded-bl-sm px-3 py-2 text-sm max-w-[80%] border border-purple-100">
                    {msg.content}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* ルールプレビューカード */}
          {rulePreview && <RulePreviewCard preview={rulePreview} />}

          {/* ローディング */}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-purple-500">
              <Loader className="w-4 h-4 animate-spin" />
              {t.ruleWizard.aiThinking}
            </div>
          )}

          {/* エラー */}
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* 入力エリア + アクションボタン */}
        <div className="border-t border-[#e5e5e5] px-4 py-3 space-y-2">
          {/* ルール確定ボタン（プレビューがある時） */}
          {rulePreview && !loading && (
            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 rounded text-white transition-colors"
                onClick={confirmRule}
              >
                <Check className="w-3.5 h-3.5" />
                {t.ruleWizard.createRule}
              </button>
              <span className="text-[10px] text-[#999]">{t.ruleWizard.orContinueAdjusting}</span>
            </div>
          )}

          {/* テキスト入力 */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.ruleWizard.inputPlaceholder}
              className="flex-1 px-3 py-1.5 text-sm border border-[#d0d0d0] rounded focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/30"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={loading}
            />
            <button
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded text-white transition-colors disabled:opacity-50"
              onClick={handleSend}
              disabled={loading || !input.trim()}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// === ルールプレビューカード ===

function RulePreviewCard({ preview }: { preview: GeneratedRulePreview }) {
  const t = useTranslation();
  const [showFiles, setShowFiles] = useState(false);

  const actionLabel = t.ruleLabels.actions[preview.action_type] || preview.action_type;
  const destName = preview.action_dest
    ? preview.action_dest.split("\\").filter(Boolean).pop() || preview.action_dest
    : null;

  return (
    <div className="bg-white rounded-lg border border-purple-200 shadow-sm overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-3 py-2 bg-purple-50/50 border-b border-purple-100">
        <Sparkles className="w-3.5 h-3.5 text-purple-500" />
        <span className="text-xs font-medium text-purple-700">{t.ruleWizard.rulePreview}</span>
      </div>

      <div className="px-3 py-2 space-y-2">
        {/* ルール名 */}
        <div className="text-sm font-medium text-[#1a1a1a]">{preview.name}</div>

        {/* 条件バッジ */}
        <div className="flex flex-wrap gap-1">
          {preview.conditions.map((c, i) => (
            <span
              key={`${c.cond_type}-${i}`}
              className="inline-flex items-center px-2 py-0.5 text-[10px] bg-[#f0f0f0] text-[#666] rounded"
            >
              {t.ruleLabels.conditions[c.cond_type as ConditionType] || c.cond_type}: {c.cond_value}
            </span>
          ))}
        </div>

        {/* アクション */}
        <div className="text-xs text-[#666]">
          {t.ruleWizard.action}: <span className="font-medium text-[#1a1a1a]">{actionLabel}</span>
          {destName && <span className="text-[#999]"> → {destName}</span>}
        </div>

        {/* 自動実行 */}
        <div className="text-[10px] text-[#999]">
          {t.ruleWizard.mode}:{" "}
          {preview.auto_execute ? t.ruleWizard.autoExecute : t.ruleWizard.suggestMode}
        </div>

        {/* マッチするファイル */}
        {preview.matching_files.length > 0 && (
          <div>
            <button
              className="flex items-center gap-1 text-[10px] text-purple-600 hover:text-purple-700 transition-colors"
              onClick={() => setShowFiles(!showFiles)}
            >
              {showFiles ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {t.ruleWizard.matchingFiles}: {preview.matching_files.length}
              {t.aiOrganizer.items}
            </button>
            {showFiles && (
              <div className="mt-1 pl-3 space-y-0.5 max-h-24 overflow-auto">
                {preview.matching_files.map((f) => (
                  <div key={f} className="text-[10px] text-[#666] truncate">
                    {f}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {preview.matching_files.length === 0 && (
          <div className="text-[10px] text-amber-600">{t.ruleWizard.noMatchingFiles}</div>
        )}
      </div>
    </div>
  );
}
