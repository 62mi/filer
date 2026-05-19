import { create } from "zustand";

export type TerminalShell = "powershell" | "cmd" | "pwsh";

interface TerminalState {
  isOpen: boolean;
  height: number;
  /** 起動時の cwd（PTY 起動の初期作業ディレクトリ。シェル起動後はシェル側のcwdが正） */
  initialCwd: string;
  /** 現在のシェル種別 */
  shell: TerminalShell;
  /** アクティブな PTY セッションID（UI 側 useEffect が管理。表示の参考のみ） */
  sessionId: string | null;

  open: (cwd?: string) => void;
  close: () => void;
  toggle: (cwd?: string) => void;
  setHeight: (height: number) => void;
  setShell: (shell: TerminalShell) => void;
  setSessionId: (id: string | null) => void;
}

function isUsableCwd(p: string | undefined): p is string {
  return !!p && p !== "home:" && !p.startsWith("smart-folder:");
}

export const useTerminalStore = create<TerminalState>((set) => ({
  isOpen: false,
  height: 280,
  initialCwd: "",
  shell: "powershell",
  sessionId: null,

  open: (cwd) =>
    set((s) => ({
      isOpen: true,
      initialCwd: isUsableCwd(cwd) ? cwd : s.initialCwd,
    })),

  // session 終了は TerminalPanel の useEffect クリーンアップに任せる
  close: () => set({ isOpen: false }),

  toggle: (cwd) =>
    set((s) => ({
      isOpen: !s.isOpen,
      initialCwd: !s.isOpen && isUsableCwd(cwd) ? cwd : s.initialCwd,
    })),

  setHeight: (height) => set({ height: Math.max(120, Math.min(720, height)) }),

  // シェル切替時は shell を更新するだけ。TerminalPanel の useEffect が
  // shell 依存で再実行され、旧セッションを cleanup → 新セッションを起動する
  setShell: (shell) => set({ shell }),

  setSessionId: (id) => set({ sessionId: id }),
}));
