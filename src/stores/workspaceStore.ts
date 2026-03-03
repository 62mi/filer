import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { useExplorerStore } from "./panelStore";
import { toast } from "./toastStore";

export interface WorkspaceTabData {
  path: string;
  label?: string;
}

export interface WorkspaceData {
  tabs: WorkspaceTabData[];
  activeTabIndex: number;
}

export interface Workspace {
  id: number;
  name: string;
  data: string;
  updated_at: string;
}

interface WorkspaceStore {
  workspaces: Workspace[];
  sessionRestored: boolean;

  // ワークスペースCRUD
  saveWorkspace: (name: string) => Promise<void>;
  loadWorkspace: (name: string) => Promise<void>;
  deleteWorkspace: (name: string) => Promise<void>;
  listWorkspaces: () => Promise<void>;

  // セッション保存・復元
  saveSession: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

/** 現在のタブ状態からWorkspaceDataを生成 */
function getCurrentWorkspaceData(): WorkspaceData {
  const { tabs, activeTabId } = useExplorerStore.getState();
  const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
  return {
    tabs: tabs.map((t) => ({
      path: t.path,
    })),
    activeTabIndex: activeIndex >= 0 ? activeIndex : 0,
  };
}

/** WorkspaceDataからタブを復元 */
async function applyWorkspaceData(data: WorkspaceData) {
  const store = useExplorerStore.getState();

  // 有効なタブデータのみフィルタ（空配列の場合はデフォルト）
  const validTabs = data.tabs.filter((t) => t.path);
  if (validTabs.length === 0) return;

  // 最初のタブのパスに移動（既存の最初のタブを再利用）
  await store.loadDirectory(validTabs[0].path, false);

  // 2つ目以降のタブを追加
  for (let i = 1; i < validTabs.length; i++) {
    store.addTab(validTabs[i].path, true);
  }

  // 余分な既存タブがあれば削除（最初のタブ以外で復元対象でないもの）
  const currentTabs = useExplorerStore.getState().tabs;
  if (currentTabs.length > validTabs.length) {
    // 先頭のvalidTabs.length個以外を削除
    for (let i = currentTabs.length - 1; i >= validTabs.length; i--) {
      if (currentTabs.length > 1) {
        store.closeTab(currentTabs[i].id);
      }
    }
  }

  // アクティブタブを設定
  const updatedTabs = useExplorerStore.getState().tabs;
  const targetIndex = Math.min(data.activeTabIndex, updatedTabs.length - 1);
  if (targetIndex >= 0 && updatedTabs[targetIndex]) {
    store.setActiveTab(updatedTabs[targetIndex].id);
    // アクティブタブのディレクトリも読み込む
    await store.loadDirectory(updatedTabs[targetIndex].path, false);
  }
}

// セッション保存のdebounceタイマー
let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** タブ変更時に呼ばれるdebounce付きセッション保存 */
export function debouncedSaveSession() {
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer);
  }
  sessionSaveTimer = setTimeout(() => {
    useWorkspaceStore.getState().saveSession();
  }, 2000);
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  sessionRestored: false,

  saveWorkspace: async (name) => {
    try {
      const data = getCurrentWorkspaceData();
      await invoke("save_workspace", {
        name,
        data: JSON.stringify(data),
      });
      toast.success(`ワークスペース "${name}" を保存しました`);
      await get().listWorkspaces();
    } catch (err: unknown) {
      toast.error(
        `ワークスペース保存に失敗: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  loadWorkspace: async (name) => {
    try {
      const result = await invoke<{ id: number; name: string; data: string; updated_at: string } | null>(
        "load_workspace",
        { name },
      );
      if (!result) {
        toast.error(`ワークスペース "${name}" が見つかりません`);
        return;
      }
      const data: WorkspaceData = JSON.parse(result.data);
      await applyWorkspaceData(data);
      toast.success(`ワークスペース "${name}" を読み込みました`);
    } catch (err: unknown) {
      toast.error(
        `ワークスペース読み込みに失敗: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  deleteWorkspace: async (name) => {
    try {
      await invoke("delete_workspace", { name });
      toast.success(`ワークスペース "${name}" を削除しました`);
      await get().listWorkspaces();
    } catch (err: unknown) {
      toast.error(
        `ワークスペース削除に失敗: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  listWorkspaces: async () => {
    try {
      const result = await invoke<Workspace[]>("list_workspaces");
      set({ workspaces: result });
    } catch (err: unknown) {
      toast.error(
        `ワークスペース一覧取得に失敗: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  saveSession: async () => {
    try {
      const data = getCurrentWorkspaceData();
      await invoke("save_session", {
        data: JSON.stringify(data),
      });
    } catch {
      // セッション保存はサイレントに失敗してOK
    }
  },

  restoreSession: async () => {
    try {
      const result = await invoke<string | null>("load_session");
      if (result) {
        const data: WorkspaceData = JSON.parse(result);
        await applyWorkspaceData(data);
      }
      set({ sessionRestored: true });
    } catch {
      // セッション復元失敗もサイレント
      set({ sessionRestored: true });
    }
  },
}));
