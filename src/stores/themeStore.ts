import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export interface ColorTheme {
  id: string;
  label: string;
  accent: string;
  /** テーマ固有のCSS変数オーバーライド */
  vars?: Record<string, string>;
}

/** CSS変数のデフォルト値（:rootと同期） */
const DEFAULT_VARS: Record<string, string> = {
  "--tab-bg": "#e0e0e0",
  "--tab-text": "#666",
  "--tab-hover": "#dedede",
  "--chrome-bg": "#f3f3f3",
  "--chrome-text": "#1a1a1a",
  "--chrome-text-dim": "#666",
  "--chrome-hover": "rgba(var(--accent-rgb), 0.10)",
  "--chrome-active": "rgba(var(--accent-rgb), 0.15)",
  "--chrome-border": "#e5e5e5",
  "--folder-color": "#e8a520",
  "--folder-fill": "#f2c55c",
};

/** hexカラーを別のベースカラーとブレンド */
function blendHex(hex: string, base: number, ratio: number): string {
  const h = hex.replace("#", "");
  const mix = (v: number) => Math.round(v * ratio + base * (1 - ratio));
  const r = mix(Number.parseInt(h.substring(0, 2), 16));
  const g = mix(Number.parseInt(h.substring(2, 4), 16));
  const b = mix(Number.parseInt(h.substring(4, 6), 16));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** 軽いティント: 白ベースにうっすらアクセントが載る（暗テキスト） */
function tintVars(accent: string): Record<string, string> {
  return {
    "--chrome-bg": blendHex(accent, 0xf3, 0.1),
  };
}

/** 濃いchrome: アクセント色背景＋白テキスト（Tomato専用） */
function chromeVars(accent: string): Record<string, string> {
  return {
    "--chrome-bg": accent,
    "--chrome-text": "#ffffff",
    "--chrome-text-dim": "rgba(255,255,255,0.7)",
    "--chrome-hover": "rgba(255,255,255,0.15)",
    "--chrome-active": "rgba(255,255,255,0.25)",
    "--chrome-border": "rgba(255,255,255,0.2)",
  };
}

export const COLOR_THEMES: ColorTheme[] = [
  { id: "auto", label: "Auto", accent: "" }, // Windows連動（起動時に動的生成）
  { id: "blue", label: "Blue", accent: "#0066ff", vars: tintVars("#0066ff") },
  { id: "teal", label: "Teal", accent: "#00b8a9", vars: tintVars("#00b8a9") },
  { id: "green", label: "Green", accent: "#00c853", vars: tintVars("#00c853") },
  { id: "orange", label: "Orange", accent: "#ff6d00", vars: tintVars("#ff6d00") },
  { id: "rose", label: "Rose", accent: "#ff1764", vars: tintVars("#ff1764") },
  { id: "purple", label: "Purple", accent: "#aa00ff", vars: tintVars("#aa00ff") },
  {
    id: "tomato",
    label: "Tomato",
    accent: "#bd482c",
    vars: {
      "--tab-bg": "#39ba43",
      "--tab-text": "rgba(255,255,255,0.9)",
      "--tab-hover": "rgba(255,255,255,0.18)",
      ...chromeVars("#bd482c"),
      "--folder-color": "#bd482c",
      "--folder-fill": "#d4714f",
    },
  },
  { id: "slate", label: "Slate", accent: "#546e7a", vars: tintVars("#546e7a") },
];

interface ThemeState {
  accentColor: string;
  windowsAccent: string;
  init: () => Promise<void>;
  applyTheme: (themeId: string) => void;
}

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = Number.parseInt(h.substring(0, 2), 16);
  const g = Number.parseInt(h.substring(2, 4), 16);
  const b = Number.parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function applyThemeVars(hex: string, vars?: Record<string, string>) {
  const rgb = hexToRgb(hex);
  const root = document.documentElement.style;
  root.setProperty("--accent", hex);
  root.setProperty("--accent-rgb", rgb);

  // テーマ固有のvarsがあれば上書き、なければデフォルトに戻す
  for (const [key, defaultValue] of Object.entries(DEFAULT_VARS)) {
    root.setProperty(key, vars?.[key] ?? defaultValue);
  }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  accentColor: "#0078d4",
  windowsAccent: "#0078d4",

  init: async () => {
    // Windowsアクセントカラーを取得
    let windowsColor = "#0078d4";
    try {
      windowsColor = await invoke<string>("get_accent_color");
    } catch {
      // ブラウザ環境ではinvokeが失敗するのでフォールバック
    }
    set({ windowsAccent: windowsColor });

    // settingsStoreから保存済みテーマを読む
    const { colorTheme } = await import("./settingsStore").then((m) =>
      m.useSettingsStore.getState(),
    );
    const theme = COLOR_THEMES.find((t) => t.id === colorTheme);
    const isAuto = !theme || theme.id === "auto";
    const color = isAuto ? windowsColor : theme.accent;
    // autoテーマはWindowsアクセントカラーからchromeVarsを動的生成
    const vars = isAuto ? tintVars(windowsColor) : theme.vars;

    set({ accentColor: color });
    applyThemeVars(color, vars);
  },

  applyTheme: (themeId: string) => {
    const theme = COLOR_THEMES.find((t) => t.id === themeId);
    const isAuto = !theme || theme.id === "auto";
    const color = isAuto ? get().windowsAccent : theme.accent;
    const vars = isAuto ? tintVars(get().windowsAccent) : theme.vars;
    set({ accentColor: color });
    applyThemeVars(color, vars);
  },
}));
