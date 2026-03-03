import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n";
import { useSmartFolderStore } from "../../stores/smartFolderStore";
import type { SmartFolderCondition, SmartFolderConditionType } from "../../types";
import { cn } from "../../utils/cn";

const CONDITION_TYPES: { value: SmartFolderConditionType; labelKey: string }[] = [
  { value: "extension", labelKey: "extension" },
  { value: "name_contains", labelKey: "nameContains" },
  { value: "name_glob", labelKey: "nameGlob" },
  { value: "size_min", labelKey: "sizeMin" },
  { value: "size_max", labelKey: "sizeMax" },
  { value: "modified_after", labelKey: "modifiedAfter" },
  { value: "modified_before", labelKey: "modifiedBefore" },
];

export function SmartFolderEditor() {
  const t = useTranslation();
  const editing = useSmartFolderStore((s) => s.editing);
  const closeEditor = useSmartFolderStore((s) => s.closeEditor);
  const save = useSmartFolderStore((s) => s.save);

  const [name, setName] = useState("");
  const [conditions, setConditions] = useState<SmartFolderCondition[]>([]);
  const [searchPaths, setSearchPaths] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // 編集対象が変わったらフォームを初期化
  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setConditions([...editing.conditions]);
      setSearchPaths([...editing.search_paths]);
    }
  }, [editing]);

  if (!editing) return null;

  const isNew = editing.id === 0;

  const addCondition = () => {
    setConditions([...conditions, { type: "extension", value: "" }]);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, field: "type" | "value", val: string) => {
    const updated = [...conditions];
    if (field === "type") {
      updated[index] = { ...updated[index], type: val as SmartFolderConditionType };
    } else {
      updated[index] = { ...updated[index], value: val };
    }
    setConditions(updated);
  };

  const addSearchPath = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t.smartFolder.selectSearchPath,
    });
    if (selected && typeof selected === "string") {
      if (!searchPaths.includes(selected)) {
        setSearchPaths([...searchPaths, selected]);
      }
    }
  };

  const removeSearchPath = (index: number) => {
    setSearchPaths(searchPaths.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    if (searchPaths.length === 0) return;

    setSaving(true);
    try {
      await save({
        id: isNew ? undefined : editing.id,
        name: name.trim(),
        conditions: conditions.filter((c) => c.value.trim() !== ""),
        searchPaths,
      });
    } finally {
      setSaving(false);
    }
  };

  const conditionLabel = (type: SmartFolderConditionType): string => {
    const labels = t.smartFolder.conditionTypes;
    return labels[type] || type;
  };

  const conditionPlaceholder = (type: SmartFolderConditionType): string => {
    switch (type) {
      case "extension":
        return "png, jpg, pdf";
      case "name_contains":
        return t.smartFolder.placeholderNameContains;
      case "name_glob":
        return "*.txt";
      case "size_min":
      case "size_max":
        return t.smartFolder.placeholderSize;
      case "modified_after":
      case "modified_before":
        return "2025-01-01";
      default:
        return "";
    }
  };

  const conditionInputType = (type: SmartFolderConditionType): string => {
    if (type === "modified_after" || type === "modified_before") return "date";
    if (type === "size_min" || type === "size_max") return "number";
    return "text";
  };

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/20"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeEditor();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-[520px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5e5]">
          <h2 className="text-sm font-semibold">
            {isNew ? t.smartFolder.create : t.smartFolder.edit}
          </h2>
          <button
            className="p-1 rounded hover:bg-[var(--chrome-hover)] transition-colors"
            onClick={closeEditor}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* 名前 */}
          <div>
            <label className="block text-xs font-medium text-[#666] mb-1">
              {t.common.name}
            </label>
            <input
              type="text"
              className="w-full px-2.5 py-1.5 text-sm border border-[#ddd] rounded focus:outline-none focus:border-[var(--accent)]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.smartFolder.namePlaceholder}
              autoFocus
            />
          </div>

          {/* 検索パス */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-[#666]">
                {t.smartFolder.searchPaths}
              </label>
              <button
                className="flex items-center gap-1 px-2 py-0.5 text-xs text-[var(--accent)] hover:bg-[var(--chrome-hover)] rounded transition-colors"
                onClick={addSearchPath}
              >
                <FolderOpen className="w-3 h-3" />
                {t.common.add}
              </button>
            </div>
            {searchPaths.length === 0 ? (
              <div className="text-xs text-[#999] italic py-2 text-center border border-dashed border-[#ddd] rounded">
                {t.smartFolder.noSearchPaths}
              </div>
            ) : (
              <div className="space-y-1">
                {searchPaths.map((sp, i) => (
                  <div
                    key={sp}
                    className="flex items-center gap-2 px-2 py-1 text-xs bg-[#f8f8f8] rounded group"
                  >
                    <FolderOpen className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="truncate flex-1" title={sp}>
                      {sp}
                    </span>
                    <button
                      className="p-0.5 rounded hover:bg-[var(--chrome-hover)] opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeSearchPath(i)}
                    >
                      <X className="w-3 h-3 text-[#999]" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 条件 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-[#666]">
                {t.smartFolder.conditions}
              </label>
              <button
                className="flex items-center gap-1 px-2 py-0.5 text-xs text-[var(--accent)] hover:bg-[var(--chrome-hover)] rounded transition-colors"
                onClick={addCondition}
              >
                <Plus className="w-3 h-3" />
                {t.common.add}
              </button>
            </div>
            {conditions.length === 0 ? (
              <div className="text-xs text-[#999] italic py-2 text-center border border-dashed border-[#ddd] rounded">
                {t.smartFolder.noConditions}
              </div>
            ) : (
              <div className="space-y-2">
                {conditions.map((cond, i) => (
                  <div key={i} className="flex items-center gap-2 group">
                    <select
                      className="px-2 py-1.5 text-xs border border-[#ddd] rounded bg-white focus:outline-none focus:border-[var(--accent)] min-w-[120px]"
                      value={cond.type}
                      onChange={(e) => updateCondition(i, "type", e.target.value)}
                    >
                      {CONDITION_TYPES.map((ct) => (
                        <option key={ct.value} value={ct.value}>
                          {conditionLabel(ct.value)}
                        </option>
                      ))}
                    </select>
                    <input
                      type={conditionInputType(cond.type)}
                      className="flex-1 px-2 py-1.5 text-xs border border-[#ddd] rounded focus:outline-none focus:border-[var(--accent)]"
                      value={cond.value}
                      onChange={(e) => updateCondition(i, "value", e.target.value)}
                      placeholder={conditionPlaceholder(cond.type)}
                    />
                    <button
                      className="p-1 rounded hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeCondition(i)}
                    >
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-[#999] mt-1.5">
              {t.smartFolder.conditionsHint}
            </p>
          </div>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#e5e5e5]">
          <button
            className="px-3 py-1.5 text-xs rounded border border-[#ddd] hover:bg-[var(--chrome-hover)] transition-colors"
            onClick={closeEditor}
          >
            {t.common.cancel}
          </button>
          <button
            className={cn(
              "px-3 py-1.5 text-xs rounded text-white transition-colors",
              name.trim() && searchPaths.length > 0 && !saving
                ? "bg-[var(--accent)] hover:opacity-90"
                : "bg-[#ccc] cursor-not-allowed",
            )}
            disabled={!name.trim() || searchPaths.length === 0 || saving}
            onClick={handleSave}
          >
            {saving ? t.common.saving : t.common.save}
          </button>
        </div>
      </div>
    </div>
  );
}
