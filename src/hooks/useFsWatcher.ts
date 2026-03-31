import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { sortEntries, useExplorerStore } from "../stores/panelStore";
import type { FileEntry } from "../types";

/**
 * 開いているタブのディレクトリをバックエンドで監視し、
 * ファイルシステム変更時に自動リフレッシュする
 */
export function useFsWatcher() {
  const tabs = useExplorerStore((s) => s.tabs);
  const prevPathsRef = useRef<Set<string>>(new Set());

  // タブのパスが変わったらwatch/unwatchを同期
  useEffect(() => {
    const currentPaths = new Set<string>();
    for (const tab of tabs) {
      if (tab.path && !tab.path.startsWith("home:") && !tab.path.startsWith("smart-folder:")) {
        currentPaths.add(tab.path);
      }
    }

    const prev = prevPathsRef.current;

    for (const p of currentPaths) {
      if (!prev.has(p)) {
        invoke("watch_directory", { path: p }).catch(() => {});
      }
    }

    for (const p of prev) {
      if (!currentPaths.has(p)) {
        invoke("unwatch_directory", { path: p }).catch(() => {});
      }
    }

    prevPathsRef.current = currentPaths;
  }, [tabs]);

  // fs-changeイベントをリッスンし、該当タブをリフレッシュ
  useEffect(() => {
    const unlistenPromise = listen<{ path: string }>("fs-change", (event) => {
      const changedDir = normalizePath(event.payload.path);
      const store = useExplorerStore.getState();

      // アクティブタブが該当ディレクトリなら smooth リフレッシュ
      const activeTab = store.getActiveTab();
      if (normalizePath(activeTab.path) === changedDir) {
        store.loadDirectory(activeTab.path, false, true);
      }

      // 非アクティブタブも直接更新
      const { showHidden } = store;
      for (const tab of store.tabs) {
        if (tab.id === store.activeTabId) continue;
        if (normalizePath(tab.path) !== changedDir) continue;

        invoke<FileEntry[]>("list_directory", { path: tab.path })
          .then((entries) => {
            const filtered = showHidden ? entries : entries.filter((e) => !e.is_hidden);
            const sorted = sortEntries(filtered, tab.sortKey, tab.sortOrder);
            useExplorerStore.setState((s) => ({
              tabs: s.tabs.map((t) => (t.id === tab.id ? { ...t, entries: sorted } : t)),
            }));
          })
          .catch(() => {});
      }
    });

    return () => {
      unlistenPromise.then((f) => f()).catch(() => {});
    };
  }, []);

  // クリーンアップ: アンマウント時に全unwatch
  useEffect(() => {
    return () => {
      for (const p of prevPathsRef.current) {
        invoke("unwatch_directory", { path: p }).catch(() => {});
      }
    };
  }, []);
}

/** パス正規化（大文字小文字・スラッシュ統一） */
function normalizePath(p: string): string {
  return p.replace(/\//g, "\\").replace(/\\$/, "").toLowerCase();
}
