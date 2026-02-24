import { create } from "zustand";

interface CommandPaletteStore {
  isOpen: boolean;
  query: string;
  selectedIndex: number;

  open: () => void;
  close: () => void;
  setQuery: (query: string) => void;
  setSelectedIndex: (index: number) => void;
  selectNext: (maxItems: number) => void;
  selectPrev: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteStore>((set) => ({
  isOpen: false,
  query: "",
  selectedIndex: 0,

  open: () => set({ isOpen: true, query: "", selectedIndex: 0 }),
  close: () => set({ isOpen: false, query: "", selectedIndex: 0 }),
  setQuery: (query) => set({ query, selectedIndex: 0 }),
  setSelectedIndex: (index) => set({ selectedIndex: index }),
  selectNext: (maxItems) =>
    set((s) => ({
      selectedIndex: Math.min(s.selectedIndex + 1, maxItems - 1),
    })),
  selectPrev: () =>
    set((s) => ({
      selectedIndex: Math.max(s.selectedIndex - 1, 0),
    })),
}));
