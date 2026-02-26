import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { AiSettings } from "./components/AiSettings";
import { BookmarkBar } from "./components/BookmarkBar";
import { CommandPalette } from "./components/CommandPalette";
import { CopyQueuePanel } from "./components/CopyQueue";
import { NavigationBar } from "./components/NavigationBar";
import { Panel } from "./components/Panel";
import { PreviewPanel } from "./components/PreviewPanel";
import { RuleManager } from "./components/RuleManager";
import { RuleWizard } from "./components/RuleWizard";
import { SettingsDialog } from "./components/SettingsDialog/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { TemplateManager } from "./components/TemplateManager";
import { getTranslation } from "./i18n";
import { useAiStore } from "./stores/aiStore";
import { useCopyQueueStore } from "./stores/copyQueueStore";
import { useExplorerStore } from "./stores/panelStore";
import { useRuleSuggestionStore } from "./stores/ruleSuggestionStore";
import { toast, useToastStore } from "./stores/toastStore";

function App() {
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [dragging, setDragging] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(280);
  const [previewDragging, setPreviewDragging] = useState(false);

  const toasts = useToastStore((s) => s.toasts);
  const tab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0]);
  const cursorEntry = (tab.searchResults ?? tab.entries)[tab.cursorIndex] ?? null;

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
      const newWidth = Math.max(200, Math.min(500, window.innerWidth - e.clientX));
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
          className="shrink-0 bg-[#f9f9f9] border-r border-[#e5e5e5] overflow-hidden"
          style={{ width: sidebarWidth }}
        >
          <Sidebar />
        </div>

        {/* Sidebar resize handle */}
        <div
          className={`w-1 cursor-col-resize hover:bg-[#0078d4] transition-colors shrink-0 ${
            dragging ? "bg-[#0078d4]" : "bg-[#e5e5e5]"
          }`}
          onMouseDown={handleMouseDown}
        />

        {/* File list panel */}
        <div className="flex-1 min-w-0">
          <Panel />
        </div>

        {/* Preview panel */}
        {previewOpen && (
          <>
            <div
              className={`w-1 cursor-col-resize hover:bg-[#0078d4] transition-colors shrink-0 ${
                previewDragging ? "bg-[#0078d4]" : "bg-[#e5e5e5]"
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

      {/* AI Settings Dialog (global) */}
      <AiSettings />

      {/* UI Settings Dialog */}
      <SettingsDialog />

      {/* Command Palette */}
      <CommandPalette />

      {/* Template Manager Dialog */}
      <TemplateManager />

      {/* Copy Queue Panel */}
      <CopyQueuePanel />

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
                    : "bg-[#0078d4] text-white"
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
