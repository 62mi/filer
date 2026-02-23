import { RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
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

// 簡易モード: よく使う設定だけ
const SIMPLE_FIELDS: SettingField[] = [
  { key: "fontSize", label: "ファイルリスト", min: 10, max: 24 },
  { key: "gridFontSize", label: "グリッドラベル", min: 9, max: 20 },
  { key: "uiFontSize", label: "UI全般", min: 9, max: 18 },
  { key: "gridIconSize", label: "グリッドアイコン", min: 48, max: 128, unit: "px" },
];

// 詳細モード: バー高さ等の細かい設定
const ADVANCED_FIELDS: SettingField[] = [
  { key: "tabBarHeight", label: "タブバー", min: 24, max: 80, unit: "px" },
  { key: "bookmarkBarHeight", label: "ブックマークバー", min: 24, max: 60, unit: "px" },
  { key: "bookmarkItemHeight", label: "ブックマーク項目", min: 20, max: 48, unit: "px" },
  { key: "toolbarHeight", label: "ツールバー", min: 28, max: 60, unit: "px" },
  { key: "columnHeaderHeight", label: "列ヘッダー", min: 20, max: 48, unit: "px" },
  { key: "detailRowHeight", label: "詳細行", min: 20, max: 48, unit: "px" },
  { key: "statusBarHeight", label: "ステータスバー", min: 16, max: 40, unit: "px" },
  { key: "gridGap", label: "グリッド間隔", min: 0, max: 16, unit: "px" },
];

type TabMode = "simple" | "advanced";

export function SettingsDialog() {
  const isOpen = useSettingsStore((s) => s.isOpen);
  const closeSettings = useSettingsStore((s) => s.closeSettings);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);
  const [tab, setTab] = useState<TabMode>("simple");

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
          <h2 className="text-sm font-medium text-[#333]">UI 設定</h2>
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
              tab === "simple"
                ? "text-[#0078d4] border-[#0078d4]"
                : "text-[#888] border-transparent hover:text-[#555]",
            )}
            onClick={() => setTab("simple")}
          >
            簡易
          </button>
          <button
            className={cn(
              "px-3 py-2 text-xs transition-colors border-b-2",
              tab === "advanced"
                ? "text-[#0078d4] border-[#0078d4]"
                : "text-[#888] border-transparent hover:text-[#555]",
            )}
            onClick={() => setTab("advanced")}
          >
            詳細
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {tab === "simple" && (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
                  フォントサイズ
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
                  アイコン
                </div>
                <div className="space-y-2.5">
                  {SIMPLE_FIELDS.filter((f) => f.key === "gridIconSize").map((field) => (
                    <SettingRow key={field.key} field={field} />
                  ))}
                  <div className="text-[10px] text-[#bbb]">Ctrl+マウスホイールでも変更可</div>
                </div>
              </div>
            </div>
          )}
          {tab === "advanced" && (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
                  バーの高さ
                </div>
                <div className="space-y-2.5">
                  {ADVANCED_FIELDS.filter((f) => f.key !== "gridGap").map((field) => (
                    <SettingRow key={field.key} field={field} />
                  ))}
                </div>
              </div>
              <div className="border-t border-[#f0f0f0] pt-3">
                <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">
                  グリッド
                </div>
                <div className="space-y-2.5">
                  {ADVANCED_FIELDS.filter((f) => f.key === "gridGap").map((field) => (
                    <SettingRow key={field.key} field={field} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 py-3 border-t border-[#e5e5e5] gap-2">
          <button
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-[#d0d0d0] text-[#666] hover:bg-[#f0f0f0] transition-colors"
            onClick={resetToDefaults}
          >
            <RotateCcw className="w-3 h-3" />
            全てリセット
          </button>
          <button
            className="px-4 py-1.5 text-xs rounded bg-[#0078d4] text-white hover:bg-[#006cbd] transition-colors"
            onClick={closeSettings}
          >
            閉じる
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
          className="w-24 h-1 accent-[#0078d4]"
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
          className="w-14 h-6 px-1 text-xs text-center border border-[#d0d0d0] rounded outline-none focus:border-[#0078d4]"
        />
        <span className="text-[10px] text-[#999] w-5">{unit}</span>
      </div>
    </div>
  );
}
