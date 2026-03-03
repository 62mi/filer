import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import {
  Check,
  Copy,
  DollarSign,
  ExternalLink,
  Key,
  Monitor,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type Language, useTranslation } from "../../i18n";
import { useAiStore } from "../../stores/aiStore";
import { type PathStyle, useSettingsStore } from "../../stores/settingsStore";
import { COLOR_THEMES, useThemeStore } from "../../stores/themeStore";
import { resetFfmpegCache } from "../../stores/thumbnailStore";
import { cn } from "../../utils/cn";

type SettingKey =
  | "tabBarHeight"
  | "bookmarkBarHeight"
  | "bookmarkItemHeight"
  | "toolbarHeight"
  | "detailRowHeight"
  | "columnHeaderHeight"
  | "statusBarHeight"
  | "gridIconSize"
  | "gridGap"
  | "fontSize"
  | "gridFontSize"
  | "uiFontSize";

interface SettingField {
  key: SettingKey;
  label: string;
  min: number;
  max: number;
  unit?: string;
}

type TabMode = "general" | "simple" | "advanced" | "ai" | "about";

export function SettingsDialog() {
  const t = useTranslation();
  const isOpen = useSettingsStore((s) => s.isOpen);
  const initialTab = useSettingsStore((s) => s.initialTab);
  const closeSettings = useSettingsStore((s) => s.closeSettings);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);
  const language = useSettingsStore((s) => s.language);
  const pathStyle = useSettingsStore((s) => s.pathStyle);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const [tab, setTab] = useState<TabMode>("general");

  // initialTab指定でダイアログが開かれた場合、そのタブに切り替え
  useEffect(() => {
    if (isOpen && initialTab) {
      setTab(initialTab as TabMode);
    } else if (isOpen) {
      setTab("general");
    }
  }, [isOpen, initialTab]);

  // 簡易モード: よく使う設定だけ
  const SIMPLE_FIELDS: SettingField[] = useMemo(
    () => [
      { key: "fontSize", label: t.settingsDialog.fileList, min: 10, max: 24 },
      { key: "gridFontSize", label: t.settingsDialog.gridLabel, min: 9, max: 20 },
      { key: "uiFontSize", label: t.settingsDialog.uiGeneral, min: 9, max: 18 },
      { key: "gridIconSize", label: t.settingsDialog.gridIcon, min: 48, max: 128, unit: "px" },
    ],
    [t],
  );

  // 詳細モード: バー高さ等の細かい設定
  const ADVANCED_FIELDS: SettingField[] = useMemo(
    () => [
      { key: "tabBarHeight", label: t.settingsDialog.tabBar, min: 24, max: 80, unit: "px" },
      {
        key: "bookmarkBarHeight",
        label: t.settingsDialog.bookmarkBar,
        min: 24,
        max: 60,
        unit: "px",
      },
      {
        key: "bookmarkItemHeight",
        label: t.settingsDialog.bookmarkItem,
        min: 20,
        max: 48,
        unit: "px",
      },
      { key: "toolbarHeight", label: t.settingsDialog.toolbar, min: 28, max: 60, unit: "px" },
      {
        key: "columnHeaderHeight",
        label: t.settingsDialog.columnHeader,
        min: 20,
        max: 48,
        unit: "px",
      },
      { key: "detailRowHeight", label: t.settingsDialog.detailRow, min: 20, max: 48, unit: "px" },
      { key: "statusBarHeight", label: t.settingsDialog.statusBar, min: 16, max: 40, unit: "px" },
      { key: "gridGap", label: t.settingsDialog.gridGap, min: 0, max: 16, unit: "px" },
    ],
    [t],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeSettings();
      }
    },
    [closeSettings],
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSettings();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-[400px] max-h-[80vh] flex flex-col animate-fade-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5e5]">
          <h2 className="text-sm font-medium text-[#333]">{t.settingsDialog.title}</h2>
          <button
            className="p-1 rounded hover:bg-[#e8e8e8] text-[#999] transition-colors"
            onClick={closeSettings}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-[#e5e5e5] px-4">
          <button
            className={cn(
              "px-3 py-2 text-xs transition-colors border-b-2",
              tab === "general"
                ? "text-[var(--accent)] border-[var(--accent)]"
                : "text-[#888] border-transparent hover:text-[#555]",
            )}
            onClick={() => setTab("general")}
          >
            {t.settingsDialog.general}
          </button>
          <button
            className={cn(
              "px-3 py-2 text-xs transition-colors border-b-2",
              tab === "simple"
                ? "text-[var(--accent)] border-[var(--accent)]"
                : "text-[#888] border-transparent hover:text-[#555]",
            )}
            onClick={() => setTab("simple")}
          >
            {t.settingsDialog.simple}
          </button>
          <button
            className={cn(
              "px-3 py-2 text-xs transition-colors border-b-2",
              tab === "advanced"
                ? "text-[var(--accent)] border-[var(--accent)]"
                : "text-[#888] border-transparent hover:text-[#555]",
            )}
            onClick={() => setTab("advanced")}
          >
            {t.settingsDialog.advanced}
          </button>
          <button
            className={cn(
              "px-3 py-2 text-xs transition-colors border-b-2",
              tab === "ai"
                ? "text-[var(--accent)] border-[var(--accent)]"
                : "text-[#888] border-transparent hover:text-[#555]",
            )}
            onClick={() => setTab("ai")}
          >
            AI
          </button>
          <button
            className={cn(
              "px-3 py-2 text-xs transition-colors border-b-2",
              tab === "about"
                ? "text-[var(--accent)] border-[var(--accent)]"
                : "text-[#888] border-transparent hover:text-[#555]",
            )}
            onClick={() => setTab("about")}
          >
            {t.settingsDialog.about}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {tab === "general" && (
            <div className="space-y-4">
              {/* カラーテーマ */}
              <div>
                <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
                  {t.settingsDialog.colorTheme}
                </div>
                <ThemePicker />
              </div>
              <div className="border-t border-[#f0f0f0] pt-3">
                <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
                  {t.settingsDialog.language}
                </div>
                <select
                  className="w-full h-8 px-2 text-xs border border-[#d0d0d0] rounded outline-none focus:border-[var(--accent)] bg-white"
                  value={language}
                  onChange={(e) => setSetting("language", e.target.value as Language)}
                >
                  <option value="ja">{t.settingsDialog.languageJa}</option>
                  <option value="en">{t.settingsDialog.languageEn}</option>
                </select>
              </div>
              <div className="border-t border-[#f0f0f0] pt-3">
                <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
                  {t.settingsDialog.pathStyle}
                </div>
                <select
                  className="w-full h-8 px-2 text-xs border border-[#d0d0d0] rounded outline-none focus:border-[var(--accent)] bg-white"
                  value={pathStyle}
                  onChange={(e) => setSetting("pathStyle", e.target.value as PathStyle)}
                >
                  <option value="windows">{t.settingsDialog.pathStyleWindows}</option>
                  <option value="linux">{t.settingsDialog.pathStyleLinux}</option>
                </select>
              </div>
              <div className="border-t border-[#f0f0f0] pt-3">
                <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
                  {t.settingsDialog.startup}
                </div>
                <AutoStartToggle />
              </div>
              <div className="border-t border-[#f0f0f0] pt-3">
                <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
                  {t.settingsDialog.externalTools}
                </div>
                <FfmpegStatus />
              </div>
              <div className="border-t border-[#f0f0f0] pt-3">
                <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
                  {t.settingsDialog.googleAccount}
                </div>
                <GoogleLoginSection />
              </div>
            </div>
          )}
          {tab === "simple" && (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
                  {t.settingsDialog.fontSize}
                </div>
                <div className="space-y-2.5">
                  {SIMPLE_FIELDS.filter((f) => f.key.includes("Font") || f.key === "fontSize").map(
                    (field) => (
                      <SettingRow key={field.key} field={field} />
                    ),
                  )}
                </div>
              </div>
              <div className="border-t border-[#f0f0f0] pt-3">
                <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
                  {t.settingsDialog.icons}
                </div>
                <div className="space-y-2.5">
                  {SIMPLE_FIELDS.filter((f) => f.key === "gridIconSize").map((field) => (
                    <SettingRow key={field.key} field={field} />
                  ))}
                  <div className="text-[10px] text-[#bbb]">{t.settingsDialog.ctrlWheelHint}</div>
                </div>
              </div>
            </div>
          )}
          {tab === "advanced" && (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
                  {t.settingsDialog.barHeights}
                </div>
                <div className="space-y-2.5">
                  {ADVANCED_FIELDS.filter((f) => f.key !== "gridGap").map((field) => (
                    <SettingRow key={field.key} field={field} />
                  ))}
                </div>
              </div>
              <div className="border-t border-[#f0f0f0] pt-3">
                <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
                  {t.settingsDialog.grid}
                </div>
                <div className="space-y-2.5">
                  {ADVANCED_FIELDS.filter((f) => f.key === "gridGap").map((field) => (
                    <SettingRow key={field.key} field={field} />
                  ))}
                </div>
              </div>
            </div>
          )}
          {tab === "ai" && <AiSettingsTab />}
          {tab === "about" && (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
                  {t.settingsDialog.aboutAppName}
                </div>
                <div className="text-xs text-[#555]">TomaFiler</div>
              </div>
              <div className="border-t border-[#f0f0f0] pt-3">
                <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
                  {t.settingsDialog.aboutVersion}
                </div>
                <div className="text-xs text-[#555]">v{__APP_VERSION__}</div>
              </div>
              <div className="border-t border-[#f0f0f0] pt-3">
                <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
                  {t.settingsDialog.aboutCopyright}
                </div>
                <div className="text-xs text-[#555]">&copy; Tomako</div>
              </div>
              <div className="border-t border-[#f0f0f0] pt-3">
                <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
                  {t.settingsDialog.aboutWebsite}
                </div>
                <a
                  href="https://www.tomatobiyori.com/tools/filer/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--accent)] underline hover:opacity-80"
                >
                  https://www.tomatobiyori.com/tools/filer/
                </a>
              </div>
              <div className="border-t border-[#f0f0f0] pt-3">
                <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
                  {t.settingsDialog.aboutContact}
                </div>
                <a
                  href="mailto:tomako@tomatobiyori.com"
                  className="text-xs text-[var(--accent)] underline hover:opacity-80"
                >
                  tomako@tomatobiyori.com
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 py-3 border-t border-[#e5e5e5] gap-2">
          {tab !== "about" && tab !== "ai" && (
            <button
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-[#d0d0d0] text-[#666] hover:bg-[#f0f0f0] transition-colors"
              onClick={() => {
                resetToDefaults();
                useThemeStore.getState().applyTheme("auto");
              }}
            >
              <RotateCcw className="w-3 h-3" />
              {t.common.resetAll}
            </button>
          )}
          <button
            className="px-4 py-1.5 text-xs rounded bg-[var(--accent)] text-white hover:opacity-90 transition-colors"
            onClick={closeSettings}
          >
            {t.common.close}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ field }: { field: SettingField }) {
  const value = useSettingsStore((s) => s[field.key]) as number;
  const setSetting = useSettingsStore((s) => s.setSetting);
  const unit = field.unit ?? "px";

  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-xs text-[#555] shrink-0 min-w-[100px]">{field.label}</label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={field.min}
          max={field.max}
          value={value}
          onChange={(e) => setSetting(field.key, Number(e.target.value))}
          className="w-24 h-1 accent-[var(--accent)]"
        />
        <input
          type="number"
          min={field.min}
          max={field.max}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v))
              setSetting(field.key, Math.max(field.min, Math.min(field.max, v)));
          }}
          className="w-14 h-6 px-1 text-xs text-center border border-[#d0d0d0] rounded outline-none focus:border-[var(--accent)]"
        />
        <span className="text-[10px] text-[#999] w-5">{unit}</span>
      </div>
    </div>
  );
}

function AiSettingsTab() {
  const t = useTranslation();
  const hasApiKey = useAiStore((s) => s.hasApiKey);
  const usageInfo = useAiStore((s) => s.usageInfo);
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
    setKeyInput("");
    setSaved(false);
    setError(null);
    setBudgetSaved(false);
    loadUsage();
  }, [loadUsage]);

  useEffect(() => {
    if (usageInfo?.budget_usd != null) {
      setBudgetInput(String(usageInfo.budget_usd));
    }
  }, [usageInfo?.budget_usd]);

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
    const amount = Number.parseFloat(budgetInput);
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

  const usagePercent = usageInfo?.budget_usd
    ? Math.min(100, (usageInfo.cost_usd / usageInfo.budget_usd) * 100)
    : 0;
  const barColor =
    usagePercent >= 90 ? "bg-red-500" : usagePercent >= 70 ? "bg-amber-500" : "bg-green-500";

  return (
    <div className="space-y-4">
      {/* APIキー */}
      <div>
        <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
          <Key className="w-3 h-3 inline mr-1" />
          Claude API Key
        </div>
        <input
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder={hasApiKey ? t.aiSettings.apiKeyPlaceholderSet : "sk-ant-..."}
          className="w-full px-3 py-1.5 text-xs border border-[#d0d0d0] rounded focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
        />
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-2 text-xs">
            {hasApiKey ? (
              <span className="text-green-600 flex items-center gap-1">
                <Check className="w-3 h-3" /> {t.aiSettings.apiKeyConfigured}
              </span>
            ) : (
              <span className="text-[#999]">{t.aiSettings.apiKeyNotConfigured}</span>
            )}
          </div>
          <div className="flex gap-1.5">
            {hasApiKey && (
              <button
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-red-500 hover:bg-red-50 rounded transition-colors"
                onClick={handleDelete}
              >
                <Trash2 className="w-3 h-3" />
                {t.aiSettings.deleteKey}
              </button>
            )}
            <button
              className="px-3 py-1 text-[10px] bg-[var(--accent)] hover:opacity-90 rounded text-white transition-colors disabled:opacity-50"
              onClick={handleSave}
              disabled={saving || !keyInput.trim()}
            >
              {saving ? t.common.saving : t.common.save}
            </button>
          </div>
        </div>
        <p className="text-[10px] text-[#bbb] mt-1">{t.aiSettings.apiKeyDescription}</p>
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

      {/* 月間予算 */}
      <div className="border-t border-[#f0f0f0] pt-3">
        <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
          <DollarSign className="w-3 h-3 inline mr-1" />
          {t.aiSettings.monthlyBudget}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#999]">$</span>
          <input
            type="number"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            placeholder={t.aiSettings.budgetPlaceholder}
            min="0"
            step="0.5"
            className="flex-1 px-3 py-1.5 text-xs border border-[#d0d0d0] rounded focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleBudgetSave();
            }}
          />
          <button
            className="px-3 py-1.5 text-[10px] bg-[var(--accent)] hover:opacity-90 rounded text-white transition-colors disabled:opacity-50"
            onClick={handleBudgetSave}
            disabled={!budgetInput.trim()}
          >
            {budgetSaved ? t.common.saved : t.common.configure}
          </button>
        </div>
      </div>

      {/* 今月の使用量 */}
      {usageInfo && (
        <div className="border-t border-[#f0f0f0] pt-3">
          <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
            {t.aiSettings.currentUsage}
          </div>
          <div className="bg-[#fafafa] rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-4 text-[11px] text-[#999]">
              <span>
                {t.aiSettings.input}: {usageInfo.input_tokens.toLocaleString()} tok
              </span>
              <span>
                {t.aiSettings.output}: {usageInfo.output_tokens.toLocaleString()} tok
              </span>
              <span className="font-medium text-[#1a1a1a]">${usageInfo.cost_usd.toFixed(3)}</span>
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
        </div>
      )}
    </div>
  );
}

function ThemePicker() {
  const t = useTranslation();
  const colorTheme = useSettingsStore((s) => s.colorTheme);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const applyTheme = useThemeStore((s) => s.applyTheme);
  const windowsAccent = useThemeStore((s) => s.windowsAccent);

  const handleSelect = (themeId: string) => {
    setSetting("colorTheme", themeId);
    applyTheme(themeId);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {COLOR_THEMES.map((theme) => {
        const isActive = colorTheme === theme.id;
        const displayColor = theme.id === "auto" ? windowsAccent : theme.accent;
        return (
          <button
            key={theme.id}
            className={cn(
              "flex flex-col items-center gap-1 p-1.5 rounded-lg border-2 transition-all duration-150 min-w-[52px]",
              isActive
                ? "border-[var(--accent)] bg-[rgba(var(--accent-rgb),0.08)]"
                : "border-transparent hover:border-[#d0d0d0] hover:bg-[#f5f5f5]",
            )}
            onClick={() => handleSelect(theme.id)}
            title={theme.id === "auto" ? t.settingsDialog.colorThemeAuto : theme.label}
          >
            {theme.id === "auto" ? (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center border border-[#d0d0d0]"
                style={{
                  background: `linear-gradient(135deg, ${windowsAccent}, ${windowsAccent}88)`,
                }}
              >
                <Monitor className="w-3.5 h-3.5 text-white" />
              </div>
            ) : (
              <div
                className="w-7 h-7 rounded-full relative"
                style={{ backgroundColor: displayColor }}
              >
                {isActive && <Check className="w-3.5 h-3.5 text-white absolute inset-0 m-auto" />}
              </div>
            )}
            <span className="text-[10px] text-[#666] leading-tight">
              {theme.id === "auto" ? "Auto" : theme.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function AutoStartToggle() {
  const t = useTranslation();
  const autoStart = useSettingsStore((s) => s.autoStart);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const [syncing, setSyncing] = useState(false);

  // ダイアログ表示時に実際の登録状態と同期
  useEffect(() => {
    isEnabled()
      .then((enabled) => {
        setSetting("autoStart", enabled);
      })
      .catch(() => {});
  }, [setSetting]);

  const handleToggle = async () => {
    setSyncing(true);
    try {
      if (autoStart) {
        await disable();
        setSetting("autoStart", false);
      } else {
        await enable();
        setSetting("autoStart", true);
      }
    } catch {
      // プラグインエラー時は状態を戻す
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={autoStart}
          onChange={handleToggle}
          disabled={syncing}
          className="w-3.5 h-3.5 accent-[var(--accent)]"
        />
        <span className="text-xs text-[#555]">{t.settingsDialog.autoStartLabel}</span>
      </label>
      <p className="text-[10px] text-[#bbb] mt-1 ml-5.5">{t.settingsDialog.autoStartDescription}</p>
    </div>
  );
}

function FfmpegStatus() {
  const t = useTranslation();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkStatus = useCallback(() => {
    setChecking(true);
    invoke<boolean>("check_ffmpeg_available")
      .then((result) => {
        setAvailable(result);
        if (result) resetFfmpegCache();
      })
      .catch(() => setAvailable(false))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const wingetCmd = "winget install Gyan.FFmpeg";

  const handleCopy = () => {
    navigator.clipboard.writeText(wingetCmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#555]">FFmpeg</span>
        {available === null ? (
          <span className="text-[10px] text-[#999]">...</span>
        ) : available ? (
          <span className="text-[10px] text-green-600 flex items-center gap-0.5">
            <Check className="w-3 h-3" />
            {t.settingsDialog.ffmpegInstalled}
          </span>
        ) : (
          <span className="text-[10px] text-amber-600">{t.settingsDialog.ffmpegNotInstalled}</span>
        )}
        <button
          className="p-0.5 rounded hover:bg-[#e8e8e8] text-[#999] transition-colors disabled:opacity-40"
          onClick={checkStatus}
          disabled={checking}
          title={t.settingsDialog.ffmpegRecheck}
        >
          <RefreshCw className={cn("w-3 h-3", checking && "animate-spin")} />
        </button>
      </div>
      <p className="text-[10px] text-[#bbb] mt-1">{t.settingsDialog.ffmpegDescription}</p>
      {available === false && (
        <div className="mt-1.5 bg-[#f5f5f5] rounded px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <code className="text-[10px] text-[#555] select-all">{wingetCmd}</code>
            <button
              className="shrink-0 p-0.5 rounded hover:bg-[#e0e0e0] text-[#999] transition-colors"
              onClick={handleCopy}
              title="Copy"
            >
              {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
          <p className="text-[10px] text-[#999] mt-1">{t.settingsDialog.ffmpegInstallGuide}</p>
        </div>
      )}
    </div>
  );
}

function GoogleLoginSection() {
  const t = useTranslation();
  const [opening, setOpening] = useState(false);
  const [driveStatus, setDriveStatus] = useState<{
    available: boolean;
    account_count: number;
  } | null>(null);

  useEffect(() => {
    invoke<{ available: boolean; account_count: number }>("check_google_drive_status")
      .then(setDriveStatus)
      .catch(() => setDriveStatus({ available: false, account_count: 0 }));
  }, []);

  const handleLogin = async () => {
    setOpening(true);
    try {
      const existing = await WebviewWindow.getByLabel("google-login");
      if (existing) {
        await existing.setFocus();
        return;
      }
      new WebviewWindow("google-login", {
        url: "https://accounts.google.com",
        title: "Google Login",
        width: 500,
        height: 700,
        center: true,
      });
    } catch {
      // ウィンドウ作成失敗
    } finally {
      setOpening(false);
    }
  };

  return (
    <div>
      {/* DriveFS 検出状態 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-[#555]">Google Drive for Desktop</span>
        {driveStatus === null ? (
          <span className="text-[10px] text-[#999]">...</span>
        ) : driveStatus.available ? (
          <span className="text-[10px] text-green-600 flex items-center gap-0.5">
            <Check className="w-3 h-3" />
            {t.settingsDialog.googleDriveDetected}
            <span className="text-[#999] ml-1">
              ({driveStatus.account_count} {t.settingsDialog.googleDriveAccounts})
            </span>
          </span>
        ) : (
          <span className="text-[10px] text-amber-600">
            {t.settingsDialog.googleDriveNotDetected}
          </span>
        )}
      </div>
      <button
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-[#d0d0d0] text-[#555] hover:bg-[#f0f0f0] transition-colors disabled:opacity-50"
        onClick={handleLogin}
        disabled={opening}
      >
        <ExternalLink className="w-3 h-3" />
        {t.settingsDialog.googleLogin}
      </button>
      <p className="text-[10px] text-[#bbb] mt-1">{t.settingsDialog.googleLoginDescription}</p>
      <p className="text-[10px] text-[#999] mt-0.5">{t.settingsDialog.googleLoginNote}</p>
    </div>
  );
}
