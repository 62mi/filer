import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

interface IconStore {
  icons: Record<string, string>;
  pending: Set<string>;
  fetchIcons: (extensions: string[]) => Promise<void>;
  getIcon: (ext: string) => string | undefined;
  largeIcons: Record<string, string>;
  pendingLarge: Set<string>;
  fetchLargeIcons: (extensions: string[]) => Promise<void>;
}

export const useIconStore = create<IconStore>((set, get) => ({
  icons: {},
  pending: new Set(),
  largeIcons: {},
  pendingLarge: new Set(),

  fetchIcons: async (extensions: string[]) => {
    const { icons, pending } = get();
    const needed = extensions.filter((ext) => !icons[ext] && !pending.has(ext));
    if (needed.length === 0) return;

    // Mark as pending to avoid duplicate requests
    set((s) => {
      const next = new Set(s.pending);
      needed.forEach((ext) => next.add(ext));
      return { pending: next };
    });

    try {
      const result = await invoke<Record<string, string>>("get_file_icons", {
        extensions: needed,
      });
      set((s) => {
        const next = new Set(s.pending);
        needed.forEach((ext) => next.delete(ext));
        return {
          icons: { ...s.icons, ...result },
          pending: next,
        };
      });
    } catch (_err) {
      set((s) => {
        const next = new Set(s.pending);
        needed.forEach((ext) => next.delete(ext));
        return { pending: next };
      });
    }
  },

  getIcon: (ext: string) => {
    return get().icons[ext];
  },

  fetchLargeIcons: async (extensions: string[]) => {
    const { largeIcons, pendingLarge } = get();
    const needed = extensions.filter((ext) => !largeIcons[ext] && !pendingLarge.has(ext));
    if (needed.length === 0) return;

    set((s) => {
      const next = new Set(s.pendingLarge);
      needed.forEach((ext) => next.add(ext));
      return { pendingLarge: next };
    });

    try {
      const result = await invoke<Record<string, string>>("get_file_icons_large", {
        extensions: needed,
      });
      set((s) => {
        const next = new Set(s.pendingLarge);
        needed.forEach((ext) => next.delete(ext));
        return {
          largeIcons: { ...s.largeIcons, ...result },
          pendingLarge: next,
        };
      });
    } catch (_err) {
      set((s) => {
        const next = new Set(s.pendingLarge);
        needed.forEach((ext) => next.delete(ext));
        return { pendingLarge: next };
      });
    }
  },
}));
