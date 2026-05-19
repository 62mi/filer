import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export type TerminalShell = "powershell" | "cmd";

export interface TerminalEntry {
  id: number;
  cwd: string;
  command: string;
  shell: TerminalShell;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  running: boolean;
}

interface RunResult {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  final_cwd: string | null;
}

interface TerminalState {
  isOpen: boolean;
  height: number;
  cwd: string;
  shell: TerminalShell;
  entries: TerminalEntry[];
  history: string[];
  historyIndex: number | null;
  running: boolean;

  open: (cwd?: string) => void;
  close: () => void;
  toggle: (cwd?: string) => void;
  setCwd: (cwd: string) => void;
  setHeight: (height: number) => void;
  setShell: (shell: TerminalShell) => void;
  clear: () => void;
  runCommand: (command: string) => Promise<void>;
  navigateHistory: (direction: -1 | 1, currentDraft: string) => string;
  resetHistoryCursor: () => void;
}

let nextId = 1;

export const useTerminalStore = create<TerminalState>((set, get) => ({
  isOpen: false,
  height: 240,
  cwd: "",
  shell: "powershell",
  entries: [],
  history: [],
  historyIndex: null,
  running: false,

  open: (cwd) =>
    set((s) => ({
      isOpen: true,
      cwd: cwd && cwd !== "home:" && !cwd.startsWith("smart-folder:") ? cwd : s.cwd,
    })),

  close: () => set({ isOpen: false }),

  toggle: (cwd) => {
    const { isOpen } = get();
    if (isOpen) {
      set({ isOpen: false });
    } else {
      set((s) => ({
        isOpen: true,
        cwd: cwd && cwd !== "home:" && !cwd.startsWith("smart-folder:") ? cwd : s.cwd,
      }));
    }
  },

  setCwd: (cwd) => set({ cwd }),

  setHeight: (height) => set({ height: Math.max(120, Math.min(720, height)) }),

  setShell: (shell) => set({ shell }),

  clear: () => set({ entries: [] }),

  runCommand: async (rawCommand) => {
    const command = rawCommand.trim();
    if (!command) return;

    const { cwd, history, shell } = get();
    if (!cwd) return;

    const id = nextId++;
    const entry: TerminalEntry = {
      id,
      cwd,
      command,
      shell,
      stdout: "",
      stderr: "",
      exitCode: null,
      running: true,
    };

    // 履歴に追加（直前と同じなら重複させない）
    const nextHistory =
      history[history.length - 1] === command ? history : [...history, command].slice(-200);

    set({
      entries: [...get().entries, entry],
      history: nextHistory,
      historyIndex: null,
      running: true,
    });

    try {
      const result = await invoke<RunResult>("run_terminal_command", { cwd, command, shell });
      set((s) => ({
        entries: s.entries.map((e) =>
          e.id === id
            ? {
                ...e,
                stdout: result.stdout,
                stderr: result.stderr,
                exitCode: result.exit_code ?? null,
                running: false,
              }
            : e,
        ),
        cwd: result.final_cwd ?? s.cwd,
        running: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({
        entries: s.entries.map((e) =>
          e.id === id ? { ...e, stderr: message, exitCode: -1, running: false } : e,
        ),
        running: false,
      }));
    }
  },

  navigateHistory: (direction, currentDraft) => {
    const { history, historyIndex } = get();
    if (history.length === 0) return currentDraft;

    if (direction === -1) {
      // 上: より古いコマンドへ
      const next = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      set({ historyIndex: next });
      return history[next] ?? currentDraft;
    } else {
      // 下: より新しいコマンドへ
      if (historyIndex === null) return currentDraft;
      const next = historyIndex + 1;
      if (next >= history.length) {
        set({ historyIndex: null });
        return "";
      }
      set({ historyIndex: next });
      return history[next] ?? currentDraft;
    }
  },

  resetHistoryCursor: () => set({ historyIndex: null }),
}));
