import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { type ConditionInput, useRuleStore } from "./ruleStore";

export interface GeneratedRulePreview {
  name: string;
  action_type: string;
  action_dest: string | null;
  conditions: ConditionInput[];
  auto_execute: boolean;
  explanation: string;
  matching_files: string[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface RuleWizardStore {
  open: boolean;
  folderPath: string | null;
  messages: ChatMessage[];
  rulePreview: GeneratedRulePreview | null;
  loading: boolean;
  error: string | null;

  openWizard: (folderPath: string) => void;
  closeWizard: () => void;
  sendMessage: (text: string) => Promise<void>;
  confirmRule: () => Promise<void>;
  reset: () => void;
}

export const useRuleWizardStore = create<RuleWizardStore>((set, get) => ({
  open: false,
  folderPath: null,
  messages: [],
  rulePreview: null,
  loading: false,
  error: null,

  openWizard: (folderPath) => {
    set({
      open: true,
      folderPath,
      messages: [],
      rulePreview: null,
      loading: false,
      error: null,
    });
  },

  closeWizard: () => {
    set({
      open: false,
      folderPath: null,
      messages: [],
      rulePreview: null,
      loading: false,
      error: null,
    });
  },

  sendMessage: async (text) => {
    const { folderPath, messages } = get();
    if (!folderPath) return;

    // ユーザーメッセージを追加
    const userMsg: ChatMessage = { role: "user", content: text };
    set({
      messages: [...messages, userMsg],
      loading: true,
      error: null,
    });

    try {
      // 会話履歴を構築（前回までのメッセージ）
      const conversationHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const preview: GeneratedRulePreview = await invoke("ai_generate_rule", {
        folderPath,
        userInstruction: text,
        conversationHistory: conversationHistory.length > 0 ? conversationHistory : null,
      });

      // AIの応答メッセージを追加
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: preview.explanation,
      };

      set((state) => ({
        messages: [...state.messages, assistantMsg],
        rulePreview: preview,
        loading: false,
      }));
    } catch (err) {
      set({
        loading: false,
        error: String(err),
      });
    }
  },

  confirmRule: async () => {
    const { folderPath, rulePreview } = get();
    if (!folderPath || !rulePreview) return;

    set({ loading: true, error: null });

    try {
      await useRuleStore
        .getState()
        .createRule(
          folderPath,
          rulePreview.name,
          rulePreview.action_type as "move" | "copy" | "delete",
          rulePreview.action_dest,
          rulePreview.conditions,
          rulePreview.auto_execute,
        );

      // 成功 → ウィザードを閉じる
      get().closeWizard();
    } catch (err) {
      set({
        loading: false,
        error: String(err),
      });
    }
  },

  reset: () => {
    set({
      messages: [],
      rulePreview: null,
      loading: false,
      error: null,
    });
  },
}));
