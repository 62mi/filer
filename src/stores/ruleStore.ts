import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { toast } from "./toastStore";

// === 型定義 ===

export interface RuleCondition {
  id: string;
  rule_id: string;
  cond_type: ConditionType;
  cond_value: string;
}

export interface FolderRule {
  id: string;
  folder_path: string;
  name: string;
  enabled: boolean;
  priority: number;
  action_type: ActionType;
  action_dest: string | null;
  created_at: number;
  updated_at: number;
  conditions: RuleCondition[];
  auto_execute: boolean;
}

export type ConditionType =
  | "extension"
  | "name_glob"
  | "name_contains"
  | "size_min"
  | "size_max"
  | "age_days";

export type ActionType = "move" | "copy" | "delete";

export interface ConditionInput {
  cond_type: ConditionType;
  cond_value: string;
}

// 条件タイプのラベル
export const CONDITION_LABELS: Record<ConditionType, string> = {
  extension: "拡張子",
  name_glob: "名前パターン (glob)",
  name_contains: "名前に含む",
  size_min: "最小サイズ (bytes)",
  size_max: "最大サイズ (bytes)",
  age_days: "経過日数",
};

// アクションタイプのラベル
export const ACTION_LABELS: Record<ActionType, string> = {
  move: "移動",
  copy: "コピー",
  delete: "ゴミ箱へ",
};

// === Store ===

interface RuleStore {
  // 状態
  rules: FolderRule[];
  loading: boolean;
  error: string | null;

  // ダイアログ状態
  dialogOpen: boolean;
  dialogFolderPath: string | null;
  editingRule: FolderRule | null;

  // CRUD
  fetchRulesForFolder: (folderPath: string) => Promise<void>;
  fetchAllRules: () => Promise<void>;
  createRule: (
    folderPath: string,
    name: string,
    actionType: ActionType,
    actionDest: string | null,
    conditions: ConditionInput[],
    autoExecute?: boolean,
  ) => Promise<FolderRule>;
  updateRule: (
    id: string,
    name: string,
    enabled: boolean,
    priority: number,
    actionType: ActionType,
    actionDest: string | null,
    conditions: ConditionInput[],
    autoExecute?: boolean,
  ) => Promise<FolderRule>;
  deleteRule: (id: string) => Promise<void>;
  toggleRule: (id: string, enabled: boolean) => Promise<void>;

  // ウォッチャー更新
  refreshWatcher: () => Promise<void>;

  // パターン提案
  suggestedPatterns: RulePattern[];
  showPatternSuggestion: boolean;
  checkForPatterns: (folderPath: string) => Promise<void>;
  dismissPatternSuggestion: () => void;
  createRuleFromPattern: (pattern: RulePattern) => Promise<void>;

  // ダイアログ操作
  openDialog: (folderPath: string, editRule?: FolderRule) => void;
  closeDialog: () => void;
  setEditingRule: (rule: FolderRule | null) => void;
}

export interface RulePattern {
  source_dir: string;
  extension: string;
  dest_dir: string;
  frequency: number;
  suggested_name: string;
}

export const useRuleStore = create<RuleStore>((set, get) => ({
  rules: [],
  loading: false,
  error: null,
  dialogOpen: false,
  dialogFolderPath: null,
  editingRule: null,
  suggestedPatterns: [],
  showPatternSuggestion: false,

  fetchRulesForFolder: async (folderPath) => {
    set({ loading: true, error: null });
    try {
      const rules: FolderRule[] = await invoke("get_rules_for_folder", {
        folderPath,
      });
      set({ rules, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  fetchAllRules: async () => {
    set({ loading: true, error: null });
    try {
      const rules: FolderRule[] = await invoke("get_all_rules");
      set({ rules, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  createRule: async (folderPath, name, actionType, actionDest, conditions, autoExecute) => {
    const rule: FolderRule = await invoke("create_rule", {
      folderPath,
      name,
      actionType,
      actionDest,
      conditions,
      autoExecute: autoExecute ?? true,
    });
    // ローカルリストに追加
    set((s) => ({ rules: [...s.rules, rule] }));
    // ウォッチャー再起動
    get()
      .refreshWatcher()
      .catch((e) => toast.error(`ウォッチャー更新失敗: ${e}`));
    return rule;
  },

  updateRule: async (
    id,
    name,
    enabled,
    priority,
    actionType,
    actionDest,
    conditions,
    autoExecute,
  ) => {
    const rule: FolderRule = await invoke("update_rule", {
      id,
      name,
      enabled,
      priority,
      actionType,
      actionDest,
      conditions,
      autoExecute: autoExecute ?? true,
    });
    set((s) => ({
      rules: s.rules.map((r) => (r.id === id ? rule : r)),
    }));
    get()
      .refreshWatcher()
      .catch((e) => toast.error(`ウォッチャー更新失敗: ${e}`));
    return rule;
  },

  deleteRule: async (id) => {
    await invoke("delete_rule", { id });
    set((s) => ({
      rules: s.rules.filter((r) => r.id !== id),
    }));
    get()
      .refreshWatcher()
      .catch((e) => toast.error(`ウォッチャー更新失敗: ${e}`));
  },

  toggleRule: async (id, enabled) => {
    await invoke("toggle_rule", { id, enabled });
    set((s) => ({
      rules: s.rules.map((r) => (r.id === id ? { ...r, enabled } : r)),
    }));
    get()
      .refreshWatcher()
      .catch((e) => toast.error(`ウォッチャー更新失敗: ${e}`));
  },

  refreshWatcher: async () => {
    try {
      await invoke("refresh_watcher");
    } catch (_err) {}
  },

  checkForPatterns: async (folderPath) => {
    try {
      const patterns: RulePattern[] = await invoke("detect_rule_patterns", {
        folderPath,
      });
      if (patterns.length > 0) {
        set({ suggestedPatterns: patterns, showPatternSuggestion: true });
      }
    } catch (_err) {}
  },

  dismissPatternSuggestion: () => {
    set({ showPatternSuggestion: false, suggestedPatterns: [] });
  },

  createRuleFromPattern: async (pattern) => {
    try {
      // パターンの移動元フォルダにルール作成
      await get().createRule(
        pattern.source_dir,
        pattern.suggested_name,
        "move",
        pattern.dest_dir,
        [{ cond_type: "extension" as ConditionType, cond_value: pattern.extension }],
        false, // サジェストモードから開始
      );
      // パターンリストから削除
      set((s) => ({
        suggestedPatterns: s.suggestedPatterns.filter(
          (p) => !(p.extension === pattern.extension && p.dest_dir === pattern.dest_dir),
        ),
      }));
    } catch (_err) {}
  },

  openDialog: (folderPath, editRule) => {
    set({
      dialogOpen: true,
      dialogFolderPath: folderPath,
      editingRule: editRule || null,
    });
  },

  closeDialog: () => {
    set({
      dialogOpen: false,
      editingRule: null,
    });
  },

  setEditingRule: (rule) => set({ editingRule: rule }),
}));
