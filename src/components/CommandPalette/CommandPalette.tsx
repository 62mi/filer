import { invoke } from "@tauri-apps/api/core";
import { Bookmark, ChevronRight, Command, File, Folder, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Command as CommandDef, fuzzyScore, getCommands } from "../../commands/registry";
import { useTranslation } from "../../i18n";
import { useBookmarkStore } from "../../stores/bookmarkStore";
import { useCommandPaletteStore } from "../../stores/commandPaletteStore";
import { useExplorerStore } from "../../stores/panelStore";
import type { FileEntry } from "../../types";

interface ResultItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  score: number;
  action: () => void;
}

const MAX_RESULTS = 15;

export function CommandPalette() {
  const t = useTranslation();
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const query = useCommandPaletteStore((s) => s.query);
  const selectedIndex = useCommandPaletteStore((s) => s.selectedIndex);
  const { close, setQuery, selectNext, selectPrev, setSelectedIndex } =
    useCommandPaletteStore.getState();

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [fileResults, setFileResults] = useState<FileEntry[]>([]);
  const debounceRef = useRef<number | null>(null);

  // フォーカス管理
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // ファイル検索（デバウンス）
  useEffect(() => {
    if (!isOpen) return;
    const isCommandMode = query.startsWith(">");
    if (isCommandMode || !query.trim()) {
      setFileResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const tab = useExplorerStore.getState().getActiveTab();
        const results: FileEntry[] = await invoke("search_files", {
          path: tab.path,
          query: query.trim(),
          maxResults: MAX_RESULTS,
          maxDepth: 3,
        });
        setFileResults(results);
      } catch {
        setFileResults([]);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen]);

  // 結果リストの構築
  const buildResults = useCallback((): ResultItem[] => {
    const isCommandMode = query.startsWith(">");
    const searchQuery = isCommandMode ? query.slice(1).trim() : query.trim();

    if (isCommandMode) {
      // コマンドモード
      const commands = getCommands();
      const scored: (CommandDef & { score: number })[] = commands
        .map((cmd) => ({
          ...cmd,
          score: searchQuery ? fuzzyScore(searchQuery, cmd.label) : 50,
        }))
        .filter((cmd) => cmd.score > 0)
        .sort((a, b) => b.score - a.score);

      return scored.slice(0, MAX_RESULTS).map((cmd) => ({
        id: `cmd:${cmd.id}`,
        label: cmd.label,
        description: cmd.shortcut,
        icon: <Command className="w-4 h-4" />,
        score: cmd.score,
        action: () => {
          close();
          cmd.action();
        },
      }));
    }

    // ファイル・ブックマーク検索モード
    const results: ResultItem[] = [];

    // ブックマーク検索
    if (searchQuery) {
      const bookmarks = useBookmarkStore.getState().bookmarks;
      for (const bm of bookmarks) {
        const score = fuzzyScore(searchQuery, bm.name);
        if (score > 0) {
          results.push({
            id: `bm:${bm.id}`,
            label: bm.name,
            description: bm.path,
            icon: <Bookmark className="w-4 h-4 text-amber-500" />,
            score: score + 5, // ブックマークにわずかな優先度ボーナス
            action: () => {
              close();
              useExplorerStore.getState().loadDirectory(bm.path);
            },
          });
        }
      }
    }

    // ファイル検索結果
    for (const entry of fileResults) {
      results.push({
        id: `file:${entry.path}`,
        label: entry.name,
        description: entry.path,
        icon: entry.is_dir ? (
          <Folder className="w-4 h-4 text-amber-500" />
        ) : (
          <File className="w-4 h-4 text-[#999]" />
        ),
        score: fuzzyScore(searchQuery, entry.name),
        action: () => {
          close();
          if (entry.is_dir) {
            useExplorerStore.getState().loadDirectory(entry.path);
          } else {
            invoke("open_in_default_app", { path: entry.path }).catch(() => {});
          }
        },
      });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
  }, [query, fileResults, close]);

  const results = isOpen ? buildResults() : [];

  // 選択アイテムのスクロール追従
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          selectNext(results.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          selectPrev();
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            results[selectedIndex].action();
          }
          break;
        case "Escape":
          e.preventDefault();
          close();
          break;
      }
    },
    [results, selectedIndex, close, selectNext, selectPrev],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/20"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="w-[560px] bg-white rounded-xl shadow-2xl border border-[#d0d0d0] overflow-hidden animate-fade-scale-in">
        {/* 入力フィールド */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e5e5e5]">
          <Search className="w-5 h-5 text-[#999] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 text-base outline-none bg-transparent placeholder:text-[#bbb]"
            placeholder={t.commandPalette.placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* 結果リスト */}
        {results.length > 0 && (
          <div ref={listRef} className="max-h-[400px] overflow-y-auto py-1">
            {results.map((item, i) => (
              <button
                key={item.id}
                className={`flex items-center gap-3 w-full px-4 py-2 text-left text-sm transition-colors ${
                  i === selectedIndex
                    ? "bg-[var(--accent)] text-white"
                    : "text-[#333] hover:bg-[#f0f0f0]"
                }`}
                onClick={item.action}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className={i === selectedIndex ? "text-white/80" : "text-[#999]"}>
                  {item.icon}
                </span>
                <span className="truncate font-medium">{item.label}</span>
                {item.description && (
                  <>
                    <ChevronRight
                      className={`w-3 h-3 shrink-0 ${i === selectedIndex ? "text-white/50" : "text-[#ccc]"}`}
                    />
                    <span
                      className={`truncate text-xs ${i === selectedIndex ? "text-white/70" : "text-[#999]"}`}
                    >
                      {item.description}
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
        )}

        {/* 空の場合 */}
        {query.trim() && results.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-[#999]">
            {t.commandPalette.noResults}
          </div>
        )}

        {/* ヒント */}
        {!query.trim() && (
          <div className="px-4 py-3 text-xs text-[#bbb] flex gap-4">
            <span>
              <kbd className="px-1 py-0.5 bg-[#f0f0f0] rounded text-[#666]">↑↓</kbd>{" "}
              {t.commandPalette.hintSelect}
            </span>
            <span>
              <kbd className="px-1 py-0.5 bg-[#f0f0f0] rounded text-[#666]">Enter</kbd>{" "}
              {t.commandPalette.hintExecute}
            </span>
            <span>
              <kbd className="px-1 py-0.5 bg-[#f0f0f0] rounded text-[#666]">Esc</kbd>{" "}
              {t.commandPalette.hintClose}
            </span>
            <span>
              <kbd className="px-1 py-0.5 bg-[#f0f0f0] rounded text-[#666]">&gt;</kbd>{" "}
              {t.commandPalette.hintCommand}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
