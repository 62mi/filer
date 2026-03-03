import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { toast } from "./toastStore";

export interface DuplicateFileInfo {
  path: string;
  name: string;
  size: number;
  modified: number;
}

export interface DuplicateGroup {
  hash: string;
  size: number;
  files: DuplicateFileInfo[];
}

interface DuplicateResult {
  groups: DuplicateGroup[];
  total_wasted_bytes: number;
  scanned_files: number;
}

interface DuplicateDetectorStore {
  isOpen: boolean;
  loading: boolean;
  groups: DuplicateGroup[];
  totalWastedBytes: number;
  scannedFiles: number;
  /** グループhash → 削除対象に選択されたファイルパスのSet */
  selectedForDeletion: Record<string, Set<string>>;
  deleting: boolean;
  targetPath: string;

  open: (path: string) => void;
  close: () => void;
  scan: (path: string, recursive?: boolean) => Promise<void>;
  toggleFileForDeletion: (groupHash: string, filePath: string) => void;
  selectAllDuplicates: () => void;
  deselectAll: () => void;
  deleteSelected: () => Promise<void>;
}

export const useDuplicateDetectorStore = create<DuplicateDetectorStore>((set, get) => ({
  isOpen: false,
  loading: false,
  groups: [],
  totalWastedBytes: 0,
  scannedFiles: 0,
  selectedForDeletion: {},
  deleting: false,
  targetPath: "",

  open: (path) => {
    set({
      isOpen: true,
      targetPath: path,
      groups: [],
      totalWastedBytes: 0,
      scannedFiles: 0,
      selectedForDeletion: {},
    });
    get().scan(path);
  },

  close: () => set({ isOpen: false }),

  scan: async (path, recursive = true) => {
    set({
      loading: true,
      groups: [],
      totalWastedBytes: 0,
      scannedFiles: 0,
      selectedForDeletion: {},
    });
    try {
      const result = await invoke<DuplicateResult>("find_duplicate_files", { path, recursive });
      set({
        loading: false,
        groups: result.groups,
        totalWastedBytes: result.total_wasted_bytes,
        scannedFiles: result.scanned_files,
      });
    } catch (err: unknown) {
      set({ loading: false });
      toast.error(`重複検出に失敗: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  toggleFileForDeletion: (groupHash, filePath) => {
    set((s) => {
      const current = s.selectedForDeletion[groupHash] ?? new Set<string>();
      const newSet = new Set(current);
      if (newSet.has(filePath)) {
        newSet.delete(filePath);
      } else {
        newSet.add(filePath);
      }
      return { selectedForDeletion: { ...s.selectedForDeletion, [groupHash]: newSet } };
    });
  },

  /** 各グループの最初のファイルを残して残りを全選択 */
  selectAllDuplicates: () => {
    const { groups } = get();
    const selected: Record<string, Set<string>> = {};
    for (const group of groups) {
      const paths = new Set<string>();
      // 最初のファイルを残して残りを選択
      for (let i = 1; i < group.files.length; i++) {
        paths.add(group.files[i].path);
      }
      selected[group.hash] = paths;
    }
    set({ selectedForDeletion: selected });
  },

  deselectAll: () => {
    set({ selectedForDeletion: {} });
  },

  deleteSelected: async () => {
    const { selectedForDeletion } = get();
    const allPaths: string[] = [];
    for (const pathSet of Object.values(selectedForDeletion)) {
      for (const p of pathSet) {
        allPaths.push(p);
      }
    }
    if (allPaths.length === 0) return;

    set({ deleting: true });
    try {
      const result = await invoke<{ succeeded: string[]; failed: [string, string][] }>(
        "delete_files",
        { paths: allPaths, toTrash: true },
      );
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length}件の削除に失敗しました`);
      }
      if (result.succeeded.length > 0) {
        toast.success(`${result.succeeded.length}件を削除しました`);
      }
      // 再スキャン
      set({ deleting: false, selectedForDeletion: {} });
      const { targetPath } = get();
      await get().scan(targetPath);
    } catch (err: unknown) {
      set({ deleting: false });
      toast.error(`削除に失敗: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
}));
