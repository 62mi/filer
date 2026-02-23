import { open } from "@tauri-apps/plugin-dialog";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ACTION_LABELS,
  type ActionType,
  CONDITION_LABELS,
  type ConditionInput,
  type ConditionType,
  type FolderRule,
  useRuleStore,
} from "../../stores/ruleStore";

interface RuleEditorProps {
  folderPath: string;
  rule: FolderRule | null; // null = 新規作成
  onBack: () => void;
}

const EMPTY_CONDITION: ConditionInput = {
  cond_type: "extension",
  cond_value: "",
};

export function RuleEditor({ folderPath, rule, onBack }: RuleEditorProps) {
  const createRule = useRuleStore((s) => s.createRule);
  const updateRule = useRuleStore((s) => s.updateRule);

  const [name, setName] = useState(rule?.name || "");
  const [actionType, setActionType] = useState<ActionType>(rule?.action_type || "move");
  const [actionDest, setActionDest] = useState(rule?.action_dest || "");
  const [conditions, setConditions] = useState<ConditionInput[]>(
    rule?.conditions.map((c) => ({
      cond_type: c.cond_type as ConditionType,
      cond_value: c.cond_value,
    })) || [{ ...EMPTY_CONDITION }],
  );
  const [autoExecute, setAutoExecute] = useState(rule?.auto_execute ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // rule が変更されたときにフォームをリセット
  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setActionType(rule.action_type);
      setActionDest(rule.action_dest || "");
      setConditions(
        rule.conditions.map((c) => ({
          cond_type: c.cond_type as ConditionType,
          cond_value: c.cond_value,
        })),
      );
      setAutoExecute(rule.auto_execute);
    } else {
      setName("");
      setActionType("move");
      setActionDest("");
      setConditions([{ ...EMPTY_CONDITION }]);
      setAutoExecute(true);
    }
    setError(null);
  }, [rule]);

  const needsDest = actionType === "move" || actionType === "copy";

  const addCondition = () => {
    setConditions([...conditions, { ...EMPTY_CONDITION }]);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, field: "cond_type" | "cond_value", value: string) => {
    setConditions(conditions.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const pickFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "移動先フォルダを選択",
      defaultPath: folderPath,
    });
    if (selected) {
      setActionDest(selected as string);
    }
  };

  const validate = (): string | null => {
    if (!name.trim()) return "ルール名を入力してください";
    if (conditions.length === 0) return "条件を1つ以上追加してください";
    for (const c of conditions) {
      if (!c.cond_value.trim()) return `「${CONDITION_LABELS[c.cond_type]}」の値を入力してください`;
    }
    if (needsDest && !actionDest.trim()) return "移動先/コピー先フォルダを指定してください";
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (rule) {
        await updateRule(
          rule.id,
          name.trim(),
          rule.enabled,
          rule.priority,
          actionType,
          needsDest ? actionDest.trim() : null,
          conditions,
          autoExecute,
        );
      } else {
        await createRule(
          folderPath,
          name.trim(),
          actionType,
          needsDest ? actionDest.trim() : null,
          conditions,
          autoExecute,
        );
      }
      onBack();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e5e5e5]">
        <button
          className="p-1 rounded hover:bg-[#e8e8e8] text-[#666] transition-colors"
          onClick={onBack}
          title="戻る"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-[#1a1a1a]">
          {rule ? "ルール編集" : "新規ルール"}
        </span>
      </div>

      {/* フォーム */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* ルール名 */}
        <div>
          <label className="block text-xs font-medium text-[#666] mb-1">ルール名</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: PDFをDocumentsへ移動"
            className="w-full px-3 py-1.5 text-sm border border-[#d0d0d0] rounded focus:outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]/30"
          />
        </div>

        {/* 条件 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-[#666]">
              条件（すべて満たすファイルに適用）
            </label>
            <button
              className="flex items-center gap-1 text-xs text-[#0078d4] hover:text-[#005a9e] transition-colors"
              onClick={addCondition}
            >
              <Plus className="w-3 h-3" />
              追加
            </button>
          </div>

          <div className="space-y-2">
            {conditions.map((cond, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={cond.cond_type}
                  onChange={(e) => updateCondition(i, "cond_type", e.target.value)}
                  className="w-36 px-2 py-1.5 text-sm border border-[#d0d0d0] rounded bg-white focus:outline-none focus:border-[#0078d4]"
                >
                  {Object.entries(CONDITION_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={cond.cond_value}
                  onChange={(e) => updateCondition(i, "cond_value", e.target.value)}
                  placeholder={getPlaceholder(cond.cond_type as ConditionType)}
                  className="flex-1 px-2 py-1.5 text-sm border border-[#d0d0d0] rounded focus:outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]/30"
                />
                {conditions.length > 1 && (
                  <button
                    className="p-1 rounded hover:bg-red-50 text-[#999] hover:text-red-500 transition-colors"
                    onClick={() => removeCondition(i)}
                    title="削除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* アクション */}
        <div>
          <label className="block text-xs font-medium text-[#666] mb-1">アクション</label>
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value as ActionType)}
            className="w-full px-3 py-1.5 text-sm border border-[#d0d0d0] rounded bg-white focus:outline-none focus:border-[#0078d4]"
          >
            {Object.entries(ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* 移動先/コピー先 */}
        {needsDest && (
          <div>
            <label className="block text-xs font-medium text-[#666] mb-1">
              {actionType === "move" ? "移動先" : "コピー先"}フォルダ
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={actionDest}
                onChange={(e) => setActionDest(e.target.value)}
                placeholder="C:\Users\Documents\..."
                className="flex-1 px-3 py-1.5 text-sm border border-[#d0d0d0] rounded focus:outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]/30"
              />
              <button
                onClick={pickFolder}
                className="px-3 py-1.5 text-sm bg-[#f0f0f0] hover:bg-[#e0e0e0] rounded border border-[#d0d0d0] text-[#1a1a1a] transition-colors whitespace-nowrap"
              >
                参照...
              </button>
            </div>
          </div>
        )}

        {/* 自動実行 */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoExecute}
              onChange={(e) => setAutoExecute(e.target.checked)}
              className="w-4 h-4 rounded border-[#d0d0d0] text-[#0078d4] focus:ring-[#0078d4]/30"
            />
            <span className="text-sm text-[#1a1a1a]">自動実行</span>
          </label>
          <p className="text-[10px] text-[#999] mt-1 ml-6">
            ONにすると確認なしで自動的に実行します。OFFの場合はサジェストとして表示されます。
          </p>
        </div>

        {/* エラー */}
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* フッター */}
      <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#e5e5e5]">
        <button
          className="px-4 py-1.5 text-sm bg-[#f0f0f0] hover:bg-[#e0e0e0] rounded border border-[#d0d0d0] text-[#1a1a1a] transition-colors"
          onClick={onBack}
          disabled={saving}
        >
          キャンセル
        </button>
        <button
          className="px-4 py-1.5 text-sm bg-[#0078d4] hover:bg-[#005a9e] rounded text-white transition-colors disabled:opacity-50"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "保存中..." : rule ? "更新" : "作成"}
        </button>
      </div>
    </div>
  );
}

function getPlaceholder(type: ConditionType): string {
  switch (type) {
    case "extension":
      return "pdf, jpg, png";
    case "name_glob":
      return "*.tmp, screenshot_*";
    case "name_contains":
      return "invoice";
    case "size_min":
      return "1048576 (1MB)";
    case "size_max":
      return "10485760 (10MB)";
    case "age_days":
      return "30";
  }
}
