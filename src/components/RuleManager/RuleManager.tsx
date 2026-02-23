import {
  GripVertical,
  Pencil,
  Plus,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ACTION_LABELS, type FolderRule, useRuleStore } from "../../stores/ruleStore";
import { useRuleWizardStore } from "../../stores/ruleWizardStore";
import { RuleEditor } from "./RuleEditor";

export function RuleManager() {
  const dialogOpen = useRuleStore((s) => s.dialogOpen);
  const dialogFolderPath = useRuleStore((s) => s.dialogFolderPath);
  const rules = useRuleStore((s) => s.rules);
  const loading = useRuleStore((s) => s.loading);
  const closeDialog = useRuleStore((s) => s.closeDialog);
  const fetchRulesForFolder = useRuleStore((s) => s.fetchRulesForFolder);
  const deleteRule = useRuleStore((s) => s.deleteRule);
  const toggleRule = useRuleStore((s) => s.toggleRule);

  const [editingRule, setEditingRule] = useState<FolderRule | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // ダイアログが開いたらルール取得
  useEffect(() => {
    if (dialogOpen && dialogFolderPath) {
      fetchRulesForFolder(dialogFolderPath);
      setShowEditor(false);
      setEditingRule(null);
      setConfirmDelete(null);
    }
  }, [dialogOpen, dialogFolderPath, fetchRulesForFolder]);

  // 編集ルールが設定されていたらエディタを表示
  const storeEditingRule = useRuleStore((s) => s.editingRule);
  useEffect(() => {
    if (storeEditingRule && dialogOpen) {
      setEditingRule(storeEditingRule);
      setShowEditor(true);
    }
  }, [storeEditingRule, dialogOpen]);

  // Escape で閉じる
  useEffect(() => {
    if (!dialogOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showEditor) {
          setShowEditor(false);
          setEditingRule(null);
        } else {
          closeDialog();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [dialogOpen, showEditor, closeDialog]);

  const handleEdit = useCallback((rule: FolderRule) => {
    setEditingRule(rule);
    setShowEditor(true);
  }, []);

  const handleNew = useCallback(() => {
    setEditingRule(null);
    setShowEditor(true);
  }, []);

  const handleEditorBack = useCallback(() => {
    setShowEditor(false);
    setEditingRule(null);
    // リロード
    if (dialogFolderPath) {
      fetchRulesForFolder(dialogFolderPath);
    }
  }, [dialogFolderPath, fetchRulesForFolder]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteRule(id);
        setConfirmDelete(null);
      } catch (_e) {}
    },
    [deleteRule],
  );

  const handleToggle = useCallback(
    async (id: string, currentEnabled: boolean) => {
      try {
        await toggleRule(id, !currentEnabled);
      } catch (_e) {}
    },
    [toggleRule],
  );

  if (!dialogOpen || !dialogFolderPath) return null;

  const folderName = dialogFolderPath.split("\\").filter(Boolean).pop() || dialogFolderPath;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 animate-fade-in"
      onClick={closeDialog}
    >
      <div
        className="bg-white rounded-lg shadow-xl border border-[#e0e0e0] w-[540px] h-[480px] flex flex-col animate-fade-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {showEditor ? (
          <RuleEditor folderPath={dialogFolderPath} rule={editingRule} onBack={handleEditorBack} />
        ) : (
          <>
            {/* タイトルバー */}
            <div className="flex items-center h-10 px-4 border-b border-[#e5e5e5] shrink-0">
              <Zap className="w-4 h-4 text-amber-500 mr-2" />
              <span className="font-semibold text-sm text-[#1a1a1a] flex-1 truncate">
                フォルダルール — {folderName}
              </span>
              <button
                className="p-1 rounded hover:bg-[#e8e8e8] text-[#666] transition-colors"
                onClick={closeDialog}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* パス表示 */}
            <div className="px-4 py-1.5 text-[10px] text-[#999] border-b border-[#f0f0f0] truncate">
              {dialogFolderPath}
            </div>

            {/* ルール一覧 */}
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center h-full text-sm text-[#999]">
                  読み込み中...
                </div>
              ) : rules.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-sm text-[#999] gap-2">
                  <Zap className="w-8 h-8 text-[#ddd]" />
                  <span>ルールがありません</span>
                  <span className="text-xs text-[#bbb]">
                    「新規ルール」をクリックして自動整理ルールを作成
                  </span>
                </div>
              ) : (
                <div className="divide-y divide-[#f0f0f0]">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className={`flex items-center gap-2 px-4 py-2.5 group hover:bg-[#fafafa] transition-colors ${
                        !rule.enabled ? "opacity-50" : ""
                      }`}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-[#ccc] shrink-0" />

                      {/* ルール情報 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#1a1a1a] truncate">
                            {rule.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f0f0f0] text-[#666] shrink-0">
                            {ACTION_LABELS[rule.action_type] || rule.action_type}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#999] truncate mt-0.5">
                          {summarizeConditions(rule)}
                          {rule.action_dest && (
                            <span>
                              {" → "}
                              {rule.action_dest.split("\\").filter(Boolean).pop()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* アクション */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          className="p-1 rounded hover:bg-[#e8e8e8] text-[#666] transition-colors"
                          onClick={() => handleEdit(rule)}
                          title="編集"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {confirmDelete === rule.id ? (
                          <button
                            className="px-2 py-0.5 text-[10px] rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
                            onClick={() => handleDelete(rule.id)}
                          >
                            削除確認
                          </button>
                        ) : (
                          <button
                            className="p-1 rounded hover:bg-red-50 text-[#999] hover:text-red-500 transition-colors"
                            onClick={() => setConfirmDelete(rule.id)}
                            title="削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* トグル */}
                      <button
                        className="shrink-0 transition-colors"
                        onClick={() => handleToggle(rule.id, rule.enabled)}
                        title={rule.enabled ? "無効にする" : "有効にする"}
                      >
                        {rule.enabled ? (
                          <ToggleRight className="w-5 h-5 text-[#0078d4]" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-[#ccc]" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* フッター */}
            <div className="flex justify-between px-4 py-3 border-t border-[#e5e5e5] shrink-0">
              <div className="flex items-center gap-2">
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#0078d4] hover:bg-[#005a9e] rounded text-white transition-colors"
                  onClick={handleNew}
                >
                  <Plus className="w-3.5 h-3.5" />
                  新規ルール
                </button>
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 rounded text-white transition-colors"
                  onClick={() => {
                    if (dialogFolderPath) {
                      useRuleWizardStore.getState().openWizard(dialogFolderPath);
                    }
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  AIで作成
                </button>
              </div>
              <button
                className="px-4 py-1.5 text-sm bg-[#f0f0f0] hover:bg-[#e0e0e0] rounded border border-[#d0d0d0] text-[#1a1a1a] transition-colors"
                onClick={closeDialog}
              >
                閉じる
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function summarizeConditions(rule: FolderRule): string {
  if (rule.conditions.length === 0) return "条件なし";
  return rule.conditions
    .map((c) => {
      switch (c.cond_type) {
        case "extension":
          return `.${c.cond_value}`;
        case "name_glob":
          return `glob: ${c.cond_value}`;
        case "name_contains":
          return `含む: ${c.cond_value}`;
        case "size_min":
          return `>${formatBytes(Number(c.cond_value))}`;
        case "size_max":
          return `<${formatBytes(Number(c.cond_value))}`;
        case "age_days":
          return `${c.cond_value}日以上`;
        default:
          return c.cond_value;
      }
    })
    .join(" & ");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)}MB`;
  return `${(bytes / 1073741824).toFixed(1)}GB`;
}
