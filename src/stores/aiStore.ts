import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";

export interface AiCategory {
  folder_name: string;
  description: string;
}

export interface AiOrganizationPlan {
  summary: string;
  categories: AiCategory[];
  file_count: number;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_cost_usd: number;
}

export interface AiSuggestedAction {
  file_path: string;
  file_name: string;
  action_type: "move" | "copy" | "delete";
  action_dest: string | null;
  reason: string;
}

export interface AiExecutionResult {
  file_path: string;
  file_name: string;
  action_type: string;
  success: boolean;
  error: string | null;
  dest_path: string | null;
}

export interface AiProgress {
  step: string;
  current: number;
  total: number;
  message: string;
  detail: string;
}

export interface AiUsageInfo {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  budget_usd: number | null;
}

interface AiStore {
  // APIキー
  hasApiKey: boolean;
  settingsOpen: boolean;

  // AI使用量
  usageInfo: AiUsageInfo | null;

  // AIダイアログ
  dialogOpen: boolean;
  dialogFolderPath: string | null;
  dialogTabId: string | null;
  userInstructions: string;
  organizationPlan: AiOrganizationPlan | null;
  suggestedActions: AiSuggestedAction[];
  loading: boolean;
  error: string | null;
  executionResults: AiExecutionResult[] | null;
  executing: boolean;
  phase: "input" | "plan" | "preview" | "results";
  progress: AiProgress | null;

  // APIキー管理
  checkApiKey: () => Promise<void>;
  saveApiKey: (key: string) => Promise<void>;
  deleteApiKey: () => Promise<void>;
  openSettings: () => void;
  closeSettings: () => void;

  // AI使用量
  loadUsage: () => Promise<void>;
  setBudget: (amount: number) => Promise<void>;

  // AIダイアログ
  openDialog: (folderPath: string, tabId: string) => void;
  closeDialog: () => void;
  setUserInstructions: (text: string) => void;
  generatePlan: () => Promise<void>;
  approvePlan: () => Promise<void>;
  executeActions: (selectedIndices: number[]) => Promise<void>;
  removeAction: (index: number) => void;
  goBack: () => void;
  reset: () => void;
}

export const useAiStore = create<AiStore>((set, get) => ({
  hasApiKey: false,
  settingsOpen: false,
  usageInfo: null,
  dialogOpen: false,
  dialogFolderPath: null,
  dialogTabId: null,
  userInstructions: "",
  organizationPlan: null,
  suggestedActions: [],
  loading: false,
  error: null,
  executionResults: null,
  executing: false,
  phase: "input",
  progress: null,

  checkApiKey: async () => {
    try {
      const has: boolean = await invoke("has_api_key");
      set({ hasApiKey: has });
    } catch {
      set({ hasApiKey: false });
    }
  },

  saveApiKey: async (key) => {
    await invoke("save_api_key", { apiKey: key });
    set({ hasApiKey: true });
  },

  deleteApiKey: async () => {
    await invoke("delete_api_key");
    set({ hasApiKey: false });
  },

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  // AI使用量
  loadUsage: async () => {
    try {
      const info: AiUsageInfo = await invoke("get_ai_usage");
      set({ usageInfo: info });
    } catch {
      // 初回起動時などエラーは無視
    }
  },

  setBudget: async (amount) => {
    await invoke("set_ai_budget", { budget: amount });
    // 更新後に再取得
    get().loadUsage();
  },

  openDialog: (folderPath, tabId) => {
    set({
      dialogOpen: true,
      dialogFolderPath: folderPath,
      dialogTabId: tabId,
      userInstructions: "",
      organizationPlan: null,
      suggestedActions: [],
      error: null,
      executionResults: null,
      phase: "input",
      loading: false,
      executing: false,
    });
  },

  closeDialog: () =>
    set({
      dialogOpen: false,
      dialogTabId: null,
      loading: false,
      executing: false,
    }),

  setUserInstructions: (text) => set({ userInstructions: text }),

  // Phase 1: 計画生成
  generatePlan: async () => {
    const { dialogFolderPath, userInstructions } = get();
    if (!dialogFolderPath || !userInstructions.trim()) return;

    set({ loading: true, error: null, progress: null });
    const unlisten = await listen<AiProgress>("ai-progress", (event) => {
      set({ progress: event.payload });
    });

    try {
      const plan: AiOrganizationPlan = await invoke("ai_generate_plan", {
        folderPath: dialogFolderPath,
        userInstructions: userInstructions.trim(),
      });
      set({ organizationPlan: plan, loading: false, phase: "plan", progress: null });
      // 使用量を更新
      get().loadUsage();
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false,
        progress: null,
      });
    } finally {
      unlisten();
    }
  },

  // Phase 2: 計画承認 → アクション生成
  approvePlan: async () => {
    const { dialogFolderPath, organizationPlan } = get();
    if (!dialogFolderPath || !organizationPlan) return;

    set({ loading: true, error: null, progress: null });
    const unlisten = await listen<AiProgress>("ai-progress", (event) => {
      set({ progress: event.payload });
    });

    try {
      const actions: AiSuggestedAction[] = await invoke("ai_generate_actions", {
        folderPath: dialogFolderPath,
        plan: organizationPlan,
      });
      set({ suggestedActions: actions, loading: false, phase: "preview", progress: null });
      // 使用量を更新
      get().loadUsage();
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false,
        progress: null,
      });
    } finally {
      unlisten();
    }
  },

  executeActions: async (selectedIndices) => {
    const { suggestedActions, dialogFolderPath } = get();
    const selected = selectedIndices.map((i) => suggestedActions[i]).filter(Boolean);
    if (selected.length === 0) return;

    set({ executing: true, error: null });
    try {
      const results: AiExecutionResult[] = await invoke("ai_execute_actions", {
        folderPath: dialogFolderPath,
        actions: selected,
      });
      set({ executionResults: results, executing: false, phase: "results" });
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err), executing: false });
    }
  },

  removeAction: (index) => {
    set((s) => ({
      suggestedActions: s.suggestedActions.filter((_, i) => i !== index),
    }));
  },

  goBack: () => {
    const { phase } = get();
    if (phase === "plan") {
      set({ phase: "input", organizationPlan: null, error: null });
    } else if (phase === "preview") {
      set({ phase: "plan", suggestedActions: [], error: null });
    }
  },

  reset: () => {
    set({
      userInstructions: "",
      organizationPlan: null,
      suggestedActions: [],
      error: null,
      executionResults: null,
      phase: "input",
    });
  },
}));
