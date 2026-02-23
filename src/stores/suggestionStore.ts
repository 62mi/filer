import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { useBookmarkStore } from "./bookmarkStore";
import { useExplorerStore } from "./panelStore";

interface MoveSuggestionFromDB {
  dest_dir: string;
  frequency: number;
  last_used: number;
  ext_matches: number;
  score: number;
}

export interface SuggestionItem {
  path: string;
  displayName: string;
  displayPath: string;
  score: number;
  source: "history" | "bookmark" | "recent" | "mixed";
}

interface SuggestionStore {
  visible: boolean;
  items: SuggestionItem[];
  selectedIndex: number;
  loading: boolean;
  draggedPaths: string[];
  position: { x: number; y: number };

  fetchSuggestions: (
    extensions: string[],
    sourceDir: string,
    draggedPaths: string[],
  ) => Promise<void>;
  show: (x: number, y: number) => void;
  hide: () => void;
  selectNext: () => void;
  selectPrev: () => void;
  getSelected: () => SuggestionItem | null;
  setSelectedIndex: (index: number) => void;
}

function shortenPath(fullPath: string): string {
  const parts = fullPath.split("\\").filter(Boolean);
  if (parts.length <= 3) return fullPath;
  return `${parts[0]}\\...\\${parts.slice(-2).join("\\")}`;
}

function getLastSegment(path: string): string {
  const parts = path.split("\\").filter(Boolean);
  return parts[parts.length - 1] || path;
}

export const useSuggestionStore = create<SuggestionStore>((set, get) => ({
  visible: false,
  items: [],
  selectedIndex: 0,
  loading: false,
  draggedPaths: [],
  position: { x: 0, y: 0 },

  fetchSuggestions: async (extensions, sourceDir, draggedPaths) => {
    set({ loading: true, draggedPaths });

    try {
      const dbResults: MoveSuggestionFromDB[] = await invoke("get_move_suggestions", {
        extensions,
        sourceDir,
        limit: 10,
      });

      // スコアマップ構築（lowercase key）
      const scoreMap = new Map<
        string,
        { score: number; path: string; source: SuggestionItem["source"] }
      >();

      for (const r of dbResults) {
        scoreMap.set(r.dest_dir.toLowerCase(), {
          score: r.score,
          path: r.dest_dir,
          source: "history",
        });
      }

      // ブックマーク統合（+0.3）
      const bookmarks = useBookmarkStore.getState().bookmarks;
      for (const bm of bookmarks) {
        const key = bm.path.toLowerCase();
        const existing = scoreMap.get(key);
        if (existing) {
          existing.score += 0.3;
          existing.source = "mixed";
        } else {
          scoreMap.set(key, { score: 0.3, path: bm.path, source: "bookmark" });
        }
      }

      // 最近のタブ履歴統合（+0.15×recency）
      const panelState = useExplorerStore.getState();
      const recentDirs: string[] = [];
      for (const tab of panelState.tabs) {
        for (let i = tab.historyIndex; i >= 0 && recentDirs.length < 10; i--) {
          const dir = tab.history[i];
          if (
            dir &&
            dir.toLowerCase() !== sourceDir.toLowerCase() &&
            !recentDirs.some((d) => d.toLowerCase() === dir.toLowerCase())
          ) {
            recentDirs.push(dir);
          }
        }
      }

      for (let i = 0; i < recentDirs.length; i++) {
        const key = recentDirs[i].toLowerCase();
        const recencyBonus = 0.15 * (1 - i / Math.max(recentDirs.length, 1));
        const existing = scoreMap.get(key);
        if (existing) {
          existing.score += recencyBonus;
          if (existing.source === "recent" || existing.source === "bookmark") {
            existing.source = "mixed";
          }
        } else {
          scoreMap.set(key, {
            score: recencyBonus,
            path: recentDirs[i],
            source: "recent",
          });
        }
      }

      // ソースディレクトリ除外、最低スコア閾値、スコア降順、上位5件
      const MIN_SCORE = 0.25;
      const items: SuggestionItem[] = Array.from(scoreMap.values())
        .filter((v) => v.path.toLowerCase() !== sourceDir.toLowerCase() && v.score >= MIN_SCORE)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((v) => ({
          path: v.path,
          displayName: getLastSegment(v.path),
          displayPath: shortenPath(v.path),
          score: v.score,
          source: v.source,
        }));

      set({ items, loading: false, selectedIndex: 0 });
    } catch (_err) {
      set({ items: [], loading: false });
    }
  },

  show: (x, y) => {
    if (get().items.length > 0) {
      set({ visible: true, position: { x, y } });
    }
  },

  hide: () => set({ visible: false, items: [], selectedIndex: 0, draggedPaths: [] }),

  selectNext: () => {
    const { items, selectedIndex } = get();
    if (items.length === 0) return;
    set({ selectedIndex: (selectedIndex + 1) % items.length });
  },

  selectPrev: () => {
    const { items, selectedIndex } = get();
    if (items.length === 0) return;
    set({
      selectedIndex: (selectedIndex - 1 + items.length) % items.length,
    });
  },

  getSelected: () => {
    const { items, selectedIndex } = get();
    return items[selectedIndex] || null;
  },

  setSelectedIndex: (index) => set({ selectedIndex: index }),
}));
