import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export interface RuleSuggestion {
  ruleId: string;
  ruleName: string;
  fileName: string;
  filePath: string;
  actionType: string;
  actionDest: string | null;
  timestamp: number;
}

interface RuleSuggestionStore {
  suggestions: RuleSuggestion[];

  addSuggestion: (s: RuleSuggestion) => void;
  removeSuggestion: (filePath: string) => void;
  acceptSuggestion: (s: RuleSuggestion) => Promise<void>;
  dismissSuggestion: (filePath: string) => void;
  alwaysDoThis: (s: RuleSuggestion) => Promise<void>;
  clearAll: () => void;
}

export const useRuleSuggestionStore = create<RuleSuggestionStore>((set, get) => ({
  suggestions: [],

  addSuggestion: (s) => {
    set((state) => {
      // 同一ファイルパスの重複を防止
      const filtered = state.suggestions.filter((x) => x.filePath !== s.filePath);
      return { suggestions: [...filtered, s] };
    });

    // 30秒後に自動非表示
    setTimeout(() => {
      set((state) => ({
        suggestions: state.suggestions.filter((x) => x.filePath !== s.filePath),
      }));
    }, 30000);
  },

  removeSuggestion: (filePath) => {
    set((state) => ({
      suggestions: state.suggestions.filter((x) => x.filePath !== filePath),
    }));
  },

  acceptSuggestion: async (s) => {
    try {
      await invoke("accept_rule_suggestion", {
        ruleId: s.ruleId,
        filePath: s.filePath,
      });
      get().removeSuggestion(s.filePath);
    } catch (_err) {}
  },

  dismissSuggestion: (filePath) => {
    get().removeSuggestion(filePath);
  },

  alwaysDoThis: async (s) => {
    try {
      // まず auto_execute を true にする
      await invoke("set_rule_auto_execute", {
        id: s.ruleId,
        autoExecute: true,
      });
      // ウォッチャー再起動
      await invoke("refresh_watcher");
      // 今回のサジェストを受理
      await get().acceptSuggestion(s);
    } catch (_err) {}
  },

  clearAll: () => set({ suggestions: [] }),
}));
