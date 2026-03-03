import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { BookmarkBar } from "./components/BookmarkBar";
import { CommandPalette } from "./components/CommandPalette";
import { CopyQueuePanel } from "./components/CopyQueue";
import { DuplicateDetector } from "./components/DuplicateDetector";
import { HomeView } from "./components/HomeView";
import { NavigationBar } from "./components/NavigationBar";
import { Panel } from "./components/Panel";
import { PreviewPanel } from "./components/PreviewPanel";
import { RuleManager } from "./components/RuleManager";
import { RuleWizard } from "./components/RuleWizard";
import { SettingsDialog } from "./components/SettingsDialog/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { SmartFolderEditor } from "./components/SmartFolderEditor/SmartFolderEditor";
import { TemplateManager } from "./components/TemplateManager";
import { useNativeDrop } from "./hooks/useNativeDrop";
import { getTranslation } from "./i18n";
import { useAiStore } from "./stores/aiStore";
import { useCopyQueueStore } from "./stores/copyQueueStore";
import { useExplorerStore } from "./stores/panelStore";
import { useRuleSuggestionStore } from "./stores/ruleSuggestionStore";
import { useThemeStore } from "./stores/themeStore";
import { toast, useToastStore } from "./stores/toastStore";
import { debouncedSaveSession, useWorkspaceStore } from "./stores/workspaceStore";

function App() {
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [dragging, setDragging] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(280);
  const [previewDragging, setPreviewDragging] = useState(false);

  const toasts = useToastStore((s) => s.toasts);
  const tab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0]);
  const cursorEntry = (tab.searchResults ?? tab.entries)[tab.cursorIndex] ?? null;

  // 起動時にテーマ初期化
  useEffect(() => {
    useThemeStore.getState().init();
  }, []);

  // 起動時にセッション復元
  useEffect(() => {
    useWorkspaceStore.getState().restoreSession();
  }, []);

  // タブ変更時にセッション自動保存（debounce）
  useEffect(() => {
    let prevTabPaths = "";
    const unsub = useExplorerStore.subscribe((state) => {
      // タブのパス一覧とアクティブタブのみ監視
      const key = state.tabs.map((t) => t.path).join("|") + ":" + state.activeTabId;
      if (key !== prevTabPaths) {
        prevTabPaths = key;
        if (useWorkspaceStore.getState().sessionRestored) {
          debouncedSaveSession();
        }
      }
    });
    return unsub;
  }, []);

  // ネイティブドロップハンドラ（外部ファイルドロップ一元管理）
  useNativeDrop();

  // 中クリック（ホイールクリック）: オートスクロール無効化 + 新しいタブで開く
  // data-mid-click-path 属性を持つ要素上で中クリック → そのパスで新タブ作成
  // WebView2では mouseup/auxclick が中クリックで発火しないため、
  // mousedown 一本で処理する
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      // WebView2は中クリックのe.targetをスクロールコンテナに設定するため、
      // elementsFromPoint で全レイヤーの要素を探索する
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      let path: string | undefined;
      for (const elem of elements) {
        const hit = (elem as HTMLElement).closest?.("[data-mid-click-path]") as HTMLElement | null;
        if (hit?.dataset.midClickPath) {
          path = hit.dataset.midClickPath;
          break;
        }
      }
      if (path) {
        useExplorerStore.getState().addTab(path);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // 起動時にAPIキーの存在チェック + 使用量ロード
  useEffect(() => {
    useAiStore.getState().checkApiKey();
    useAiStore.getState().loadUsage();
  }, []);

  // コピーキューのイベントリスナー
  useEffect(() => {
    const unlistenPromise = useCopyQueueStore.getState().initListener();
    return () => {
      unlistenPromise.then((fn) => fn()).catch(() => {});
    };
  }, []);

  // クリップボード変更イベント（OS側のクリップボード監視）
  useEffect(() => {
    const unlisten = listen<{ paths: string[]; operation: string }>(
      "clipboard-changed",
      (event) => {
        useExplorerStore
          .getState()
          .syncExternalClipboard(event.payload.paths, event.payload.operation);
      },
    );
    return () => {
      unlisten.then((f) => f()).catch(() => {});
    };
  }, []);

  // ルール自動実行の通知をリッスン
  useEffect(() => {
    const unlistenExec = listen<{
      rule_name: string;
      file_name: string;
      action_type: string;
    }>("rule-executed", (event) => {
      const { rule_name, file_name, action_type } = event.payload;
      const t = getTranslation();
      const actionLabel =
        action_type === "move"
          ? t.ruleExecution.actionMove
          : action_type === "copy"
            ? t.ruleExecution.actionCopy
            : t.ruleExecution.actionDelete;
      toast.success(
        t.ruleExecution.executed
          .replace("{rule}", rule_name)
          .replace("{file}", file_name)
          .replace("{action}", actionLabel),
      );
      useExplorerStore.getState().refreshDirectory();
    });

    const unlistenErr = listen<{
      rule_name: string;
      file_name: string;
      error: string;
    }>("rule-error", (event) => {
      const { rule_name, file_name, error } = event.payload;
      toast.error(`${rule_name}: ${file_name} — ${error}`);
    });

    // ルールサジェストイベント（auto_execute = false のルールがマッチ）
    const unlistenSuggest = listen<{
      rule_id: string;
      rule_name: string;
      file_name: string;
      file_path: string;
      action_type: string;
      action_dest: string | null;
    }>("rule-suggestion", (event) => {
      const { rule_id, rule_name, file_name, file_path, action_type, action_dest } = event.payload;
      useRuleSuggestionStore.getState().addSuggestion({
        ruleId: rule_id,
        ruleName: rule_name,
        fileName: file_name,
        filePath: file_path,
        actionType: action_type,
        actionDest: action_dest,
        timestamp: Date.now(),
      });
    });

    return () => {
      unlistenExec.then((f) => f()).catch(() => {});
      unlistenErr.then((f) => f()).catch(() => {});
      unlistenSuggest.then((f) => f()).catch(() => {});
    };
  }, []);

  const handleMouseDown = () => setDragging(true);
  const handlePreviewMouseDown = () => setPreviewDragging(true);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging) {
      const newWidth = Math.max(160, Math.min(400, e.clientX));
      setSidebarWidth(newWidth);
    }
    if (previewDragging) {
      const newWidth = Math.max(200, Math.min(800, window.innerWidth - e.clientX));
      setPreviewWidth(newWidth);
    }
  };

  const handleMouseUp = () => {
    setDragging(false);
    setPreviewDragging(false);
  };

  return (
    <div
      className="flex flex-col h-screen bg-white text-[#1a1a1a]"
      onMouseMove={dragging || previewDragging ? handleMouseMove : undefined}
      onMouseUp={dragging || previewDragging ? handleMouseUp : undefined}
      onMouseLeave={dragging || previewDragging ? handleMouseUp : undefined}
    >
      {/* Tab bar */}
      <TabBar />

      {/* Navigation bar */}
      <NavigationBar />

      {/* Bookmark bar */}
      <BookmarkBar />

      {/* Main content: sidebar + file list + preview */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div
          className="shrink-0 border-r border-[var(--chrome-border)] overflow-hidden"
          style={{
            width: sidebarWidth,
            background: "var(--chrome-bg)",
            color: "var(--chrome-text)",
          }}
        >
          <Sidebar />
        </div>

        {/* Sidebar resize handle */}
        <div
          className={`w-1 cursor-col-resize hover:bg-[var(--accent)] transition-colors shrink-0 ${
            dragging ? "bg-[var(--accent)]" : "bg-[var(--chrome-border)]"
          }`}
          onMouseDown={handleMouseDown}
        />

        {/* File list panel */}
        <div className="flex-1 min-w-0">{tab.path === "home:" ? <HomeView /> : <Panel />}</div>

        {/* Preview panel */}
        {previewOpen && (
          <>
            <div
              className={`w-1 cursor-col-resize hover:bg-[var(--accent)] transition-colors shrink-0 ${
                previewDragging ? "bg-[var(--accent)]" : "bg-[#e5e5e5]"
              }`}
              onMouseDown={handlePreviewMouseDown}
            />
            <div className="shrink-0 overflow-hidden" style={{ width: previewWidth }}>
              <PreviewPanel entry={cursorEntry} onClose={() => setPreviewOpen(false)} />
            </div>
          </>
        )}
      </div>

      {/* Status bar */}
      <StatusBar onTogglePreview={() => setPreviewOpen(!previewOpen)} previewOpen={previewOpen} />

      {/* Rule Manager Dialog */}
      <RuleManager />

      {/* AI Rule Wizard Dialog */}
      <RuleWizard />

      {/* Settings Dialog */}
      <SettingsDialog />

      {/* Command Palette */}
      <CommandPalette />

      {/* Template Manager Dialog */}
      <TemplateManager />

      {/* Smart Folder Editor */}
      <SmartFolderEditor />

      {/* Copy Queue Panel */}
      <CopyQueuePanel />

      {/* Duplicate Detector Dialog */}
      <DuplicateDetector />

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-10 right-4 z-50 flex flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`px-4 py-2 rounded-lg shadow-lg text-sm max-w-xs animate-fade-scale-in ${
                t.type === "error"
                  ? "bg-red-500 text-white"
                  : t.type === "info"
                    ? "bg-gray-700 text-white"
                    : "bg-[var(--accent)] text-white"
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
