import { Check, DollarSign, Key, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n";
import { useAiStore } from "../../stores/aiStore";

export function AiSettings() {
  const t = useTranslation();
  const settingsOpen = useAiStore((s) => s.settingsOpen);
  const hasApiKey = useAiStore((s) => s.hasApiKey);
  const usageInfo = useAiStore((s) => s.usageInfo);
  const closeSettings = useAiStore((s) => s.closeSettings);
  const saveApiKey = useAiStore((s) => s.saveApiKey);
  const deleteApiKey = useAiStore((s) => s.deleteApiKey);
  const setBudget = useAiStore((s) => s.setBudget);
  const loadUsage = useAiStore((s) => s.loadUsage);

  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [budgetInput, setBudgetInput] = useState("");
  const [budgetSaved, setBudgetSaved] = useState(false);

  useEffect(() => {
    if (settingsOpen) {
      setKeyInput("");
      setSaved(false);
      setError(null);
      setBudgetSaved(false);
      loadUsage();
      // 予算入力を初期化
      if (usageInfo?.budget_usd !== null && usageInfo?.budget_usd !== undefined) {
        setBudgetInput(String(usageInfo.budget_usd));
      } else {
        setBudgetInput("");
      }
    }
  }, [settingsOpen, loadUsage, usageInfo?.budget_usd]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!settingsOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSettings();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [settingsOpen, closeSettings]);

  const handleSave = async () => {
    if (!keyInput.trim()) {
      setError(t.aiSettings.enterApiKey);
      return;
    }
    if (!keyInput.trim().startsWith("sk-")) {
      setError(t.aiSettings.apiKeyMustStartWithSk);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveApiKey(keyInput.trim());
      setSaved(true);
      setKeyInput("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteApiKey();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleBudgetSave = async () => {
    const amount = parseFloat(budgetInput);
    if (Number.isNaN(amount) || amount < 0) {
      setError(t.aiSettings.enterValidAmount);
      return;
    }
    try {
      await setBudget(amount);
      setBudgetSaved(true);
      setTimeout(() => setBudgetSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!settingsOpen) return null;

  // 使用量のパーセンテージ
  const usagePercent = usageInfo?.budget_usd
    ? Math.min(100, (usageInfo.cost_usd / usageInfo.budget_usd) * 100)
    : 0;
  const barColor =
    usagePercent >= 90 ? "bg-red-500" : usagePercent >= 70 ? "bg-amber-500" : "bg-green-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 animate-fade-in"
      onClick={closeSettings}
    >
      <div
        className="bg-white rounded-lg shadow-xl border border-[#e0e0e0] w-[420px] flex flex-col animate-fade-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* タイトルバー */}
        <div className="flex items-center h-10 px-4 border-b border-[#e5e5e5] shrink-0">
          <Key className="w-4 h-4 text-[#0078d4] mr-2" />
          <span className="font-semibold text-sm text-[#1a1a1a] flex-1">{t.aiSettings.title}</span>
          <button
            className="p-1 rounded hover:bg-[#e8e8e8] text-[#666] transition-colors"
            onClick={closeSettings}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-auto">
          {/* APIキーセクション */}
          <div>
            <label className="block text-xs font-medium text-[#666] mb-1">Claude API Key</label>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={hasApiKey ? t.aiSettings.apiKeyPlaceholderSet : "sk-ant-..."}
              className="w-full px-3 py-1.5 text-sm border border-[#d0d0d0] rounded focus:outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]/30"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>

          {/* ステータス */}
          <div className="flex items-center gap-2 text-xs">
            {hasApiKey ? (
              <span className="text-green-600 flex items-center gap-1">
                <Check className="w-3 h-3" /> {t.aiSettings.apiKeyConfigured}
              </span>
            ) : (
              <span className="text-[#999]">{t.aiSettings.apiKeyNotConfigured}</span>
            )}
          </div>

          <p className="text-[10px] text-[#999]">{t.aiSettings.apiKeyDescription}</p>

          {/* 月間予算セクション */}
          <div className="border-t border-[#f0f0f0] pt-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-[#0078d4]" />
              <span className="text-xs font-medium text-[#666]">{t.aiSettings.monthlyBudget}</span>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm text-[#999]">$</span>
              <input
                type="number"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                placeholder={t.aiSettings.budgetPlaceholder}
                min="0"
                step="0.5"
                className="flex-1 px-3 py-1.5 text-sm border border-[#d0d0d0] rounded focus:outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]/30"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleBudgetSave();
                }}
              />
              <button
                className="px-3 py-1.5 text-xs bg-[#0078d4] hover:bg-[#005a9e] rounded text-white transition-colors disabled:opacity-50"
                onClick={handleBudgetSave}
                disabled={!budgetInput.trim()}
              >
                {budgetSaved ? t.common.saved : t.common.configure}
              </button>
            </div>

            {/* 今月の使用量 */}
            {usageInfo && (
              <div className="bg-[#fafafa] rounded-lg p-3 space-y-2">
                <div className="text-xs font-medium text-[#666]">{t.aiSettings.currentUsage}</div>
                <div className="flex items-center gap-4 text-[11px] text-[#999]">
                  <span>
                    {t.aiSettings.input}: {usageInfo.input_tokens.toLocaleString()} tok
                  </span>
                  <span>
                    {t.aiSettings.output}: {usageInfo.output_tokens.toLocaleString()} tok
                  </span>
                  <span className="font-medium text-[#1a1a1a]">
                    ${usageInfo.cost_usd.toFixed(3)}
                  </span>
                </div>

                {usageInfo.budget_usd !== null && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-[#999]">
                      <span>
                        ${usageInfo.cost_usd.toFixed(2)} / ${usageInfo.budget_usd.toFixed(0)}
                      </span>
                      <span>{usagePercent.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-[#e5e5e5] rounded-full h-1.5">
                      <div
                        className={`${barColor} h-1.5 rounded-full transition-all`}
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {saved && (
            <div className="text-xs text-green-600 bg-green-50 border border-green-200 rounded px-3 py-2">
              {t.aiSettings.apiKeySaved}
            </div>
          )}

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex justify-between px-4 py-3 border-t border-[#e5e5e5]">
          {hasApiKey ? (
            <button
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded transition-colors"
              onClick={handleDelete}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t.aiSettings.deleteKey}
            </button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <button
              className="px-4 py-1.5 text-sm bg-[#f0f0f0] hover:bg-[#e0e0e0] rounded border border-[#d0d0d0] text-[#1a1a1a] transition-colors"
              onClick={closeSettings}
            >
              {t.common.close}
            </button>
            <button
              className="px-4 py-1.5 text-sm bg-[#0078d4] hover:bg-[#005a9e] rounded text-white transition-colors disabled:opacity-50"
              onClick={handleSave}
              disabled={saving || !keyInput.trim()}
            >
              {saving ? t.common.saving : t.common.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
