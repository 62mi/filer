import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { SmartFolder, SmartFolderCondition } from "../types";
import { toast } from "./toastStore";

interface SmartFolderStore {
  /** 保存済みスマートフォルダ一覧 */
  smartFolders: SmartFolder[];
  /** 編集中のスマートフォルダ（null = エディタ非表示） */
  editing: SmartFolder | null;

  /** 一覧を取得 */
  load: () => Promise<void>;
  /** 保存（新規 or 更新） */
  save: (input: {
    id?: number;
    name: string;
    conditions: SmartFolderCondition[];
    searchPaths: string[];
  }) => Promise<SmartFolder>;
  /** 削除 */
  remove: (id: number) => Promise<void>;
  /** エディタを開く（新規: null, 編集: SmartFolder） */
  openEditor: (folder?: SmartFolder) => void;
  /** エディタを閉じる */
  closeEditor: () => void;
}

export const useSmartFolderStore = create<SmartFolderStore>((set, get) => ({
  smartFolders: [],
  editing: null,

  load: async () => {
    try {
      const folders = await invoke<SmartFolder[]>("list_smart_folders");
      set({ smartFolders: folders });
    } catch (err: unknown) {
      toast.error(
        `スマートフォルダの読み込みに失敗: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  save: async (input) => {
    try {
      const result = await invoke<SmartFolder>("save_smart_folder", {
        input: {
          id: input.id ?? null,
          name: input.name,
          conditions: input.conditions,
          search_paths: input.searchPaths,
        },
      });
      // 一覧を再読み込み
      await get().load();
      set({ editing: null });
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`スマートフォルダの保存に失敗: ${msg}`);
      throw new Error(msg);
    }
  },

  remove: async (id) => {
    try {
      await invoke("delete_smart_folder", { id });
      await get().load();
    } catch (err: unknown) {
      toast.error(
        `スマートフォルダの削除に失敗: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  openEditor: (folder) => {
    set({
      editing: folder ?? {
        id: 0,
        name: "",
        conditions: [],
        search_paths: [],
        created_at: "",
      },
    });
  },

  closeEditor: () => {
    set({ editing: null });
  },
}));
