import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { getTranslation } from "../i18n";
import { toast } from "./toastStore";

export interface CustomAction {
  id: string;
  name: string;
  command: string;
  icon?: string;
  showFor: "file" | "directory" | "both";
  extensions: string; // カンマ区切り (例: "jpg,png,gif")、空=全て
  sortOrder: number;
}

interface CustomActionState {
  actions: CustomAction[];
  loaded: boolean;

  loadActions: () => Promise<void>;
  saveAction: (action: Omit<CustomAction, "sortOrder" | "id"> & { id?: string }) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
  executeAction: (actionId: string, filePath: string) => Promise<void>;

  /** 指定ファイルに表示すべきアクションをフィルタ */
  getActionsForEntry: (isDir: boolean, extension: string) => CustomAction[];
}

export const useCustomActionStore = create<CustomActionState>((set, get) => ({
  actions: [],
  loaded: false,

  loadActions: async () => {
    try {
      const raw =
        await invoke<
          {
            id: string;
            name: string;
            command: string;
            icon: string | null;
            show_for: string;
            extensions: string;
            sort_order: number;
          }[]
        >("list_custom_actions");

      const actions: CustomAction[] = raw.map((r) => ({
        id: r.id,
        name: r.name,
        command: r.command,
        icon: r.icon ?? undefined,
        showFor: r.show_for as "file" | "directory" | "both",
        extensions: r.extensions,
        sortOrder: r.sort_order,
      }));

      set({ actions, loaded: true });
    } catch (err: unknown) {
      const t = getTranslation();
      toast.error(
        `${t.customAction.loadFailed}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  saveAction: async (action) => {
    try {
      const result = await invoke<{
        id: string;
        name: string;
        command: string;
        icon: string | null;
        show_for: string;
        extensions: string;
        sort_order: number;
      }>("save_custom_action", {
        id: action.id ?? null,
        name: action.name,
        command: action.command,
        icon: action.icon ?? null,
        showFor: action.showFor,
        extensions: action.extensions,
      });

      const saved: CustomAction = {
        id: result.id,
        name: result.name,
        command: result.command,
        icon: result.icon ?? undefined,
        showFor: result.show_for as "file" | "directory" | "both",
        extensions: result.extensions,
        sortOrder: result.sort_order,
      };

      set((state) => {
        const exists = state.actions.find((a) => a.id === saved.id);
        if (exists) {
          return { actions: state.actions.map((a) => (a.id === saved.id ? saved : a)) };
        }
        return { actions: [...state.actions, saved] };
      });

      toast.success(getTranslation().customAction.saved);
    } catch (err: unknown) {
      const t = getTranslation();
      toast.error(
        `${t.customAction.saveFailed}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  deleteAction: async (id) => {
    try {
      await invoke("delete_custom_action", { id });
      set((state) => ({
        actions: state.actions.filter((a) => a.id !== id),
      }));
      toast.success(getTranslation().customAction.deleted);
    } catch (err: unknown) {
      const t = getTranslation();
      toast.error(
        `${t.customAction.deleteFailed}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  executeAction: async (actionId, filePath) => {
    const action = get().actions.find((a) => a.id === actionId);
    if (!action) return;

    try {
      await invoke("execute_custom_action", {
        command: action.command,
        path: filePath,
      });
    } catch (err: unknown) {
      const t = getTranslation();
      toast.error(
        `${t.customAction.executeFailed}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  getActionsForEntry: (isDir, extension) => {
    const { actions } = get();
    return actions.filter((a) => {
      // showFor フィルタ
      if (a.showFor === "file" && isDir) return false;
      if (a.showFor === "directory" && !isDir) return false;

      // 拡張子フィルタ (ファイルのみ、空=全て)
      if (!isDir && a.extensions) {
        const exts = a.extensions
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);
        if (exts.length > 0 && !exts.includes(extension.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  },
}));
