import { invoke } from "@tauri-apps/api/core";
import { useAiStore } from "../stores/aiStore";
import { useExplorerStore } from "../stores/panelStore";
import { useRuleStore } from "../stores/ruleStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useTemplateStore } from "../stores/templateStore";
import { toast } from "../stores/toastStore";
import { useWorkspaceStore } from "../stores/workspaceStore";

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

export function getCommands(): Command[] {
  return [
    {
      id: "new-tab",
      label: "新しいタブ",
      shortcut: "Ctrl+T",
      action: () => useExplorerStore.getState().addTab(),
    },
    {
      id: "settings",
      label: "設定",
      shortcut: "Ctrl+,",
      action: () => useSettingsStore.getState().openSettings(),
    },
    {
      id: "toggle-hidden",
      label: "隠しファイルの表示切替",
      shortcut: "Ctrl+H",
      action: () => useExplorerStore.getState().toggleHidden(),
    },
    {
      id: "rule-manager",
      label: "ルール管理",
      action: () => {
        const tab = useExplorerStore.getState().getActiveTab();
        useRuleStore.getState().openDialog(tab.path);
      },
    },
    {
      id: "ai-organize",
      label: "AI自動整理",
      action: () => {
        const state = useExplorerStore.getState();
        const tab = state.getActiveTab();
        useAiStore.getState().openDialog(tab.path, tab.id);
      },
    },
    {
      id: "ai-settings",
      label: "AI設定",
      action: () => useSettingsStore.getState().openSettings("ai"),
    },
    {
      id: "reload",
      label: "再読み込み",
      shortcut: "F5",
      action: () => useExplorerStore.getState().refreshDirectory(),
    },
    {
      id: "new-folder",
      label: "新しいフォルダ",
      action: () => useExplorerStore.getState().createNewFolder(),
    },
    {
      id: "new-file",
      label: "新しいファイル",
      action: () => useExplorerStore.getState().createNewFile(),
    },
    {
      id: "select-all",
      label: "すべて選択",
      shortcut: "Ctrl+A",
      action: () => useExplorerStore.getState().selectAll(),
    },
    {
      id: "view-details",
      label: "詳細表示",
      action: () => useExplorerStore.getState().setViewMode("details"),
    },
    {
      id: "view-icons",
      label: "アイコン表示",
      action: () => useExplorerStore.getState().setViewMode("icons"),
    },
    {
      id: "navigate-up",
      label: "親フォルダへ移動",
      shortcut: "Alt+Backspace",
      action: () => useExplorerStore.getState().navigateUp(),
    },
    {
      id: "template-manager",
      label: "テンプレート管理",
      action: () => useTemplateStore.getState().openDialog(),
    },
    {
      id: "go-home",
      label: "ホーム画面に移動",
      shortcut: "Alt+Home",
      action: () => useExplorerStore.getState().loadDirectory("home:"),
    },
    {
      id: "new-window",
      label: "新しいウィンドウ",
      shortcut: "Ctrl+Shift+N",
      action: () => {
        invoke("create_new_window").catch(() => {
          toast.error("新しいウィンドウの作成に失敗しました");
        });
      },
    },
    {
      id: "workspace-save",
      label: "ワークスペースを保存",
      action: () => {
        const name = window.prompt("ワークスペース名を入力してください");
        if (name?.trim()) {
          useWorkspaceStore.getState().saveWorkspace(name.trim());
        }
      },
    },
    {
      id: "workspace-load",
      label: "ワークスペースを読み込み",
      action: async () => {
        await useWorkspaceStore.getState().listWorkspaces();
        const { workspaces } = useWorkspaceStore.getState();
        if (workspaces.length === 0) {
          toast.info("保存されたワークスペースがありません");
          return;
        }
        // コマンドパレットにワークスペース一覧を表示するため設定画面を開く
        useSettingsStore.getState().openSettings("workspace");
      },
    },
    {
      id: "workspace-settings",
      label: "ワークスペース管理",
      action: () => {
        useSettingsStore.getState().openSettings("workspace");
      },
    },
  ];
}

/** 軽量ファジー検索スコアリング */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // 完全一致
  if (t === q) return 100;
  // 先頭一致
  if (t.startsWith(q)) return 80;
  // 含む
  if (t.includes(q)) return 60;

  // 文字順序一致（ファジー）
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      consecutive++;
      score += consecutive; // 連続マッチにボーナス
    } else {
      consecutive = 0;
    }
  }
  if (qi === q.length) {
    return 20 + Math.min(score, 20);
  }

  return 0; // マッチなし
}
