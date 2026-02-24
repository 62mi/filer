import { create } from "zustand";

interface SettingsState {
  // Bar heights (px)
  tabBarHeight: number;
  bookmarkBarHeight: number;
  bookmarkItemHeight: number;
  toolbarHeight: number;
  detailRowHeight: number;
  columnHeaderHeight: number;
  statusBarHeight: number;

  // Grid settings
  gridIconSize: number;
  gridGap: number;

  // Font sizes (px)
  fontSize: number; // 詳細ビューのファイル行
  gridFontSize: number; // グリッドセルのファイル名
  uiFontSize: number; // タブ・ブックマーク・ステータスバー等のUI

  // Settings dialog
  isOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;

  // Actions
  setSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  setGridIconSize: (size: number) => void;
  resetToDefaults: () => void;
}

const STORAGE_KEY = "filer-settings";

interface SettingsData {
  tabBarHeight: number;
  bookmarkBarHeight: number;
  bookmarkItemHeight: number;
  toolbarHeight: number;
  detailRowHeight: number;
  columnHeaderHeight: number;
  statusBarHeight: number;
  gridIconSize: number;
  gridGap: number;
  fontSize: number;
  gridFontSize: number;
  uiFontSize: number;
}

const DEFAULTS: SettingsData = {
  tabBarHeight: 32,
  bookmarkBarHeight: 36,
  bookmarkItemHeight: 28,
  toolbarHeight: 40,
  detailRowHeight: 32,
  columnHeaderHeight: 32,
  statusBarHeight: 24,
  gridIconSize: 96,
  gridGap: 4,
  fontSize: 14,
  gridFontSize: 12,
  uiFontSize: 12,
};

function loadSettings(): Partial<SettingsData> {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveSettings(state: SettingsState) {
  const data: SettingsData = {
    tabBarHeight: state.tabBarHeight,
    bookmarkBarHeight: state.bookmarkBarHeight,
    bookmarkItemHeight: state.bookmarkItemHeight,
    toolbarHeight: state.toolbarHeight,
    detailRowHeight: state.detailRowHeight,
    columnHeaderHeight: state.columnHeaderHeight,
    statusBarHeight: state.statusBarHeight,
    gridIconSize: state.gridIconSize,
    gridGap: state.gridGap,
    fontSize: state.fontSize,
    gridFontSize: state.gridFontSize,
    uiFontSize: state.uiFontSize,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage full
  }
}

const saved = loadSettings();

export const useSettingsStore = create<SettingsState>((set, get) => ({
  tabBarHeight: saved.tabBarHeight ?? DEFAULTS.tabBarHeight,
  bookmarkBarHeight: saved.bookmarkBarHeight ?? DEFAULTS.bookmarkBarHeight,
  bookmarkItemHeight: saved.bookmarkItemHeight ?? DEFAULTS.bookmarkItemHeight,
  toolbarHeight: saved.toolbarHeight ?? DEFAULTS.toolbarHeight,
  detailRowHeight: saved.detailRowHeight ?? DEFAULTS.detailRowHeight,
  columnHeaderHeight: saved.columnHeaderHeight ?? DEFAULTS.columnHeaderHeight,
  statusBarHeight: saved.statusBarHeight ?? DEFAULTS.statusBarHeight,
  gridIconSize: saved.gridIconSize ?? DEFAULTS.gridIconSize,
  gridGap: saved.gridGap ?? DEFAULTS.gridGap,
  fontSize: saved.fontSize ?? DEFAULTS.fontSize,
  gridFontSize: saved.gridFontSize ?? DEFAULTS.gridFontSize,
  uiFontSize: saved.uiFontSize ?? DEFAULTS.uiFontSize,

  isOpen: false,
  openSettings: () => set({ isOpen: true }),
  closeSettings: () => set({ isOpen: false }),

  setSetting: (key, value) => {
    set({ [key]: value } as Partial<SettingsState>);
    saveSettings(get());
  },

  setGridIconSize: (size) => {
    const clamped = Math.max(48, Math.min(128, size));
    set({ gridIconSize: clamped });
    saveSettings(get());
  },

  resetToDefaults: () => {
    set({ ...DEFAULTS });
    saveSettings(get());
  },
}));

// Computed helpers (not in store to avoid re-renders)
export function getGridCellWidth(state: { gridIconSize: number }) {
  return state.gridIconSize + 24;
}

export function getGridCellHeight(state: { gridIconSize: number }) {
  // アイコン + ファイル名テキスト領域（3〜4行分）
  return state.gridIconSize + 50;
}
