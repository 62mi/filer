import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import { useExplorerStore } from "./panelStore";

export interface CopyQueueItem {
  id: string;
  sources: string[];
  dest: string;
  operation: string;
  total_bytes: number;
  copied_bytes: number;
  file_count: number;
  files_done: number;
  status: string;
  error: string | null;
  current_file: string | null;
}

interface CopyQueueStore {
  items: CopyQueueItem[];
  isPanelOpen: boolean;

  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;

  enqueue: (sources: string[], dest: string, operation: "copy" | "move") => Promise<string>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  clearCompleted: () => Promise<void>;

  // 内部用: イベントハンドラ
  updateItem: (progress: CopyQueueItem) => void;
  initListener: () => Promise<() => void>;
}

export const useCopyQueueStore = create<CopyQueueStore>((set, get) => ({
  items: [],
  isPanelOpen: false,

  openPanel: () => set({ isPanelOpen: true }),
  closePanel: () => set({ isPanelOpen: false }),
  togglePanel: () => set((s) => ({ isPanelOpen: !s.isPanelOpen })),

  enqueue: async (sources, dest, operation) => {
    const id: string = await invoke("enqueue_copy", { sources, dest, operation });
    // invokeの間にcopy-progressイベントが先に到着している可能性がある
    // その場合 sources/dest/operation が欠けているので補完する
    set((s) => {
      const exists = s.items.some((i) => i.id === id);
      if (exists) {
        return {
          isPanelOpen: true,
          items: s.items.map((i) => (i.id === id ? { ...i, sources, dest, operation } : i)),
        };
      }
      // まだイベント未到着の場合、プレースホルダーを追加
      return {
        isPanelOpen: true,
        items: [
          ...s.items,
          {
            id,
            sources,
            dest,
            operation,
            total_bytes: 0,
            copied_bytes: 0,
            file_count: 0,
            files_done: 0,
            status: "calculating",
            error: null,
            current_file: null,
          },
        ],
      };
    });
    return id;
  },

  pause: async (id) => {
    await invoke("pause_copy", { id });
  },

  resume: async (id) => {
    await invoke("resume_copy", { id });
  },

  cancel: async (id) => {
    await invoke("cancel_copy", { id });
  },

  clearCompleted: async () => {
    await invoke("clear_completed_copies");
    set((s) => ({
      items: s.items.filter(
        (i) => i.status !== "completed" && i.status !== "cancelled" && i.status !== "error",
      ),
    }));
  },

  updateItem: (progress) => {
    set((s) => {
      const exists = s.items.some((i) => i.id === progress.id);
      if (exists) {
        // 既存アイテムにマージ（sources/dest/operationを保持）
        return {
          items: s.items.map((i) => (i.id === progress.id ? { ...i, ...progress } : i)),
        };
      }
      // enqueueより先にイベントが来た場合（sources/dest/operation欠如）
      // enqueue側で後から補完される
      return { items: [...s.items, progress] };
    });

    // コピー完了時: コピー先が現在のアクティブタブならリロード
    if (progress.status === "completed") {
      const item = get().items.find((i) => i.id === progress.id);
      const dest = item?.dest || progress.dest;
      if (dest) {
        const explorerState = useExplorerStore.getState();
        const activeTab = explorerState.getActiveTab();
        if (activeTab.path === dest) {
          explorerState.refreshDirectory();
        }
      }
    }
  },

  initListener: async () => {
    const unlisten = await listen<CopyQueueItem>("copy-progress", (event) => {
      get().updateItem(event.payload);
    });
    return unlisten;
  },
}));
