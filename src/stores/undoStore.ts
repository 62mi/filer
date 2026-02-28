import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

/** Windowsパスから親ディレクトリを取得（"/"と"\\"の両方に対応） */
function getParentDir(filePath: string): string {
  const normalized = filePath.replace(/\//g, "\\");
  const lastSep = normalized.lastIndexOf("\\");
  if (lastSep <= 0) return normalized;
  // "C:\" のようなルートの場合はそのまま返す
  if (lastSep === 2 && normalized[1] === ":") return normalized.substring(0, 3);
  return normalized.substring(0, lastSep);
}

/** Windowsパスからファイル名を取得（"/"と"\\"の両方に対応） */
function getFileName(filePath: string): string {
  const normalized = filePath.replace(/\//g, "\\");
  return normalized.substring(normalized.lastIndexOf("\\") + 1);
}

// 操作タイプ
export type UndoActionType =
  | "move"
  | "copy"
  | "rename"
  | "delete"
  | "create_dir"
  | "create_file"
  | "folderize";

// Undo可能な操作の記録
export interface UndoAction {
  type: UndoActionType;
  timestamp: number;
  // move: 移動元→移動先の記録
  // rename: 旧パス→新パスの記録
  // delete: 削除されたパスの記録（ゴミ箱送り）
  // create_dir/create_file: 作成されたパスの記録
  // copy: コピー先のパスの記録（Undoでコピー先を削除）
  // folderize: ファイルグループ化（Undoでファイル戻し+フォルダ削除）
  entries: {
    sourcePath: string;
    destPath: string;
  }[];
  /** folderize用: 作成されたフォルダのパス */
  createdFolder?: string;
}

interface UndoStore {
  undoStack: UndoAction[];
  redoStack: UndoAction[];
  maxStackSize: number;

  // 操作を記録
  pushAction: (action: Omit<UndoAction, "timestamp">) => void;

  // Undo/Redo実行
  undo: () => Promise<UndoAction | null>;
  redo: () => Promise<UndoAction | null>;

  // 状態
  canUndo: () => boolean;
  canRedo: () => boolean;

  // スタッククリア
  clear: () => void;
}

// 操作の逆操作を実行
async function executeUndo(action: UndoAction): Promise<void> {
  switch (action.type) {
    case "move": {
      // 移動の逆: dest → source に戻す
      for (const entry of action.entries) {
        await invoke("move_files", {
          sources: [entry.destPath],
          dest: getParentDir(entry.sourcePath),
        });
      }
      break;
    }
    case "copy": {
      // コピーの逆: コピー先を削除
      const paths = action.entries.map((e) => e.destPath);
      await invoke<{ succeeded: string[]; failed: [string, string][] }>("delete_files", { paths, toTrash: true });
      break;
    }
    case "rename": {
      // リネームの逆: 新名 → 旧名に戻す
      for (const entry of action.entries) {
        await invoke("rename_file", {
          path: entry.destPath,
          newName: getFileName(entry.sourcePath),
        });
      }
      break;
    }
    case "delete": {
      // 削除の逆: ゴミ箱からの復元はOS依存のため、対応不可
      // エラーをスローして通知
      throw new Error("ゴミ箱からの復元はOSのゴミ箱から手動で行ってください");
    }
    case "create_dir":
    case "create_file": {
      // 作成の逆: 作成したファイル/フォルダを削除
      const paths = action.entries.map((e) => e.destPath);
      await invoke<{ succeeded: string[]; failed: [string, string][] }>("delete_files", { paths, toTrash: true });
      break;
    }
    case "folderize": {
      // フォルダ化の逆: ファイルを元の場所に戻し、空フォルダを削除
      for (const entry of action.entries) {
        await invoke("move_files", {
          sources: [entry.destPath],
          dest: getParentDir(entry.sourcePath),
        });
      }
      // 作成されたフォルダを削除（空のはず）
      if (action.createdFolder) {
        await invoke<{ succeeded: string[]; failed: [string, string][] }>("delete_files", { paths: [action.createdFolder], toTrash: true });
      }
      break;
    }
  }
}

// 操作の再実行
async function executeRedo(action: UndoAction): Promise<void> {
  switch (action.type) {
    case "move": {
      // 移動を再実行
      const sources = action.entries.map((e) => e.sourcePath);
      const destDir = getParentDir(action.entries[0].destPath);
      await invoke("move_files", { sources, dest: destDir });
      break;
    }
    case "copy": {
      // コピーを再実行
      const sources = action.entries.map((e) => e.sourcePath);
      const destDir = getParentDir(action.entries[0].destPath);
      await invoke("copy_files", { sources, dest: destDir });
      break;
    }
    case "rename": {
      // リネームを再実行
      for (const entry of action.entries) {
        await invoke("rename_file", {
          path: entry.sourcePath,
          newName: getFileName(entry.destPath),
        });
      }
      break;
    }
    case "delete": {
      // 削除を再実行
      const paths = action.entries.map((e) => e.sourcePath);
      await invoke<{ succeeded: string[]; failed: [string, string][] }>("delete_files", { paths, toTrash: true });
      break;
    }
    case "create_dir": {
      for (const entry of action.entries) {
        await invoke("create_directory", {
          path: getParentDir(entry.destPath),
          name: getFileName(entry.destPath),
        });
      }
      break;
    }
    case "create_file": {
      for (const entry of action.entries) {
        await invoke("create_file", {
          path: getParentDir(entry.destPath),
          name: getFileName(entry.destPath),
        });
      }
      break;
    }
    case "folderize": {
      // フォルダ化を再実行: フォルダ作成→ファイル移動
      if (action.createdFolder) {
        await invoke("create_directory", {
          path: getParentDir(action.createdFolder),
          name: getFileName(action.createdFolder),
        });
      }
      const sources = action.entries.map((e) => e.sourcePath);
      const destDir = action.createdFolder || getParentDir(action.entries[0].destPath);
      await invoke("move_files", { sources, dest: destDir });
      break;
    }
  }
}

export const useUndoStore = create<UndoStore>((set, get) => ({
  undoStack: [],
  redoStack: [],
  maxStackSize: 50,

  pushAction: (action) => {
    set((s) => {
      const newStack = [...s.undoStack, { ...action, timestamp: Date.now() }];
      // スタックサイズ制限
      if (newStack.length > s.maxStackSize) {
        newStack.shift();
      }
      return {
        undoStack: newStack,
        redoStack: [], // 新しい操作が入ったらredoスタックをクリア
      };
    });
  },

  undo: async () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return null;

    const action = undoStack[undoStack.length - 1];
    try {
      await executeUndo(action);
      set((s) => ({
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, action],
      }));
      return action;
    } catch (e: unknown) {
      // 削除のUndoは失敗しても履歴からは消さない
      if (action.type === "delete") {
        throw e;
      }
      return null;
    }
  },

  redo: async () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return null;

    const action = redoStack[redoStack.length - 1];
    try {
      await executeRedo(action);
      set((s) => ({
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, action],
      }));
      return action;
    } catch (_e: unknown) {
      return null;
    }
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  clear: () => set({ undoStack: [], redoStack: [] }),
}));
