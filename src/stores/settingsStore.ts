import { create } from "zustand";
import type { Language } from "../i18n";

export type PathStyle = "windows" | "linux";

export interface ColumnWidths {
  name: number;
  modified: number;
  extension: number;
  size: number;
}

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

  // Column widths (px)
  columnWidths: ColumnWidths;

  // Color theme
  colorTheme: string;

  // Language
  language: Language;

  // Path display style
  pathStyle: PathStyle;

  // Startup
  autoStart: boolean;

  // Settings dialog
  isOpen: boolean;
  initialTab: string | null;
  openSettings: (tab?: string) => void;
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
  columnWidths: ColumnWidths;
  colorTheme: string;
  language: Language;
  pathStyle: PathStyle;
  autoStart: boolean;
}

const DEFAULT_COLUMN_WIDTHS: ColumnWidths = {
  name: 260,
  modified: 132,
  extension: 88,
  size: 80,
};

const DEFAULTS: SettingsData = {
  tabBarHeight: 46,
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
  columnWidths: DEFAULT_COLUMN_WIDTHS,
  colorTheme: "auto",
  language: "ja",
  pathStyle: "windows" as PathStyle,
  autoStart: false,
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
    columnWidths: state.columnWidths,
    colorTheme: state.colorTheme,
    language: state.language,
    pathStyle: state.pathStyle,
    autoStart: state.autoStart,
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
  columnWidths: { ...DEFAULT_COLUMN_WIDTHS, ...saved.columnWidths },
  colorTheme: saved.colorTheme ?? DEFAULTS.colorTheme,
  language: saved.language ?? DEFAULTS.language,
  pathStyle: saved.pathStyle ?? DEFAULTS.pathStyle,
  autoStart: saved.autoStart ?? DEFAULTS.autoStart,

  isOpen: false,
  initialTab: null,
  openSettings: (tab) => set({ isOpen: true, initialTab: tab ?? null }),
  closeSettings: () => set({ isOpen: false, initialTab: null }),

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

// 列幅合計（横スクロール用の最小幅計算）
// アイコン(16) + mr(8) + px-2左右(16) + 全列幅
export function getTotalColumnWidth(cw: ColumnWidths) {
  return 24 + 16 + cw.name + cw.modified + cw.extension + cw.size;
}

// Computed helpers (not in store to avoid re-renders)
export function getGridCellWidth(state: { gridIconSize: number }) {
  return state.gridIconSize + 24;
}

export function getGridCellHeight(state: { gridIconSize: number }) {
  // アイコン + ファイル名テキスト領域（3〜4行分）
  return state.gridIconSize + 50;
}
