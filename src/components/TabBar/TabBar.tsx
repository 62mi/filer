import { getCurrentWindow } from "@tauri-apps/api/window";
import { Folder, Home, Plus, Sparkles, X } from "lucide-react";
import { useTabDrag } from "../../hooks/useTabDrag";
import { useTranslation } from "../../i18n";
import { useAiStore } from "../../stores/aiStore";
import { useExplorerStore } from "../../stores/panelStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { cn } from "../../utils/cn";
import { WindowControls } from "./WindowControls";

/** ドロップインジケーター（青い縦線） */
function DropIndicator() {
  return <div className="w-0.5 shrink-0 self-stretch bg-[var(--accent)] rounded-full my-1" />;
}

export function TabBar() {
  const t = useTranslation();
  const tabs = useExplorerStore((s) => s.tabs);
  const activeTabId = useExplorerStore((s) => s.activeTabId);
  const setActiveTab = useExplorerStore((s) => s.setActiveTab);
  const addTab = useExplorerStore((s) => s.addTab);
  const closeTab = useExplorerStore((s) => s.closeTab);
  const aiDialogTabId = useAiStore((s) => s.dialogTabId);
  const aiLoading = useAiStore((s) => s.loading);
  const aiDialogOpen = useAiStore((s) => s.dialogOpen);
  const tabBarHeight = useSettingsStore((s) => s.tabBarHeight);
  const uiFontSize = useSettingsStore((s) => s.uiFontSize);

  const {
    draggingTabId,
    dropIndicatorIndex,
    externalDropIndex,
    ghostRef,
    handleTabMouseDown,
    tabBarRef,
  } = useTabDrag();

  // 内部ドラッグまたは外部ドラッグのインジケーター位置
  const indicatorIndex = dropIndicatorIndex ?? externalDropIndex;

  // ドラッグ中タブのラベル（ゴースト表示用）
  const draggingTab = draggingTabId ? tabs.find((t) => t.id === draggingTabId) : null;
  const draggingLabel = draggingTab
    ? draggingTab.path.split(/[\\/]/).filter(Boolean).pop() || draggingTab.path
    : "";

  return (
    <div
      className="flex select-none shrink-0 relative overflow-hidden"
      style={{
        height: tabBarHeight,
        fontSize: uiFontSize,
        background: [
          "linear-gradient(180deg,",
          "rgba(var(--accent-rgb), 0.18) 0%,",
          "rgba(var(--accent-rgb), 0.1) 100%),",
          "var(--tab-bg)",
        ].join(" "),
      }}
    >
      {/* タブバー下端のセパレータライン（アクティブタブが覆う） */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-[var(--tab-bg)] z-0" />

      <div
        ref={tabBarRef}
        className="flex overflow-x-auto pl-3 gap-px"
        style={{ height: tabBarHeight }}
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const isDragging = tab.id === draggingTabId;
          const isHome = tab.path === "home:";
          const label = isHome
            ? t.sidebar.home
            : tab.path.split(/[\\/]/).filter(Boolean).pop() || tab.path;
          const hasAi = aiDialogOpen && aiDialogTabId === tab.id;
          const tabHeight = isActive ? tabBarHeight - 2 : tabBarHeight - 4;
          return (
            <div key={tab.id} className="flex shrink-0" style={{ height: tabBarHeight }}>
              {/* ドロップインジケーター: タブの前に表示 */}
              {indicatorIndex === index && <DropIndicator />}
              <div
                data-tab-index={index}
                className={cn(
                  "group flex items-center gap-1.5 px-3 cursor-grab max-w-52 min-w-0 rounded-t-[6px]",
                  "transition-[background-color,color,opacity] duration-100 ease-out",
                  isActive
                    ? "bg-white text-[#1a1a1a] relative z-10"
                    : "bg-transparent text-[var(--tab-text)] hover:bg-[var(--tab-hover)]",
                  isDragging && "opacity-30",
                )}
                style={{ height: tabHeight, marginTop: tabBarHeight - tabHeight }}
                onClick={() => {
                  if (!draggingTabId) setActiveTab(tab.id);
                }}
                onMouseDown={(e) => {
                  if (e.button === 1 && tabs.length > 1) {
                    e.preventDefault();
                    closeTab(tab.id);
                    return;
                  }
                  handleTabMouseDown(e, tab.id, index);
                }}
                title={tab.path}
              >
                {isHome ? (
                  <Home className="w-3.5 h-3.5 text-[var(--chrome-text-dim)] shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-[var(--folder-color)] shrink-0 fill-[var(--folder-fill)]" />
                )}
                {hasAi && (
                  <Sparkles
                    className={cn("w-3 h-3 text-purple-500 shrink-0", aiLoading && "animate-pulse")}
                  />
                )}
                <span className="truncate flex-1">{label}</span>
                {tabs.length > 1 && (
                  <button
                    className={cn(
                      "p-0.5 rounded hover:bg-[var(--tab-hover)] shrink-0 transition-opacity",
                      isActive
                        ? "opacity-60 hover:opacity-100"
                        : "opacity-0 group-hover:opacity-100",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    title="Close tab"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {/* 最後尾のドロップインジケーター */}
        {indicatorIndex === tabs.length && <DropIndicator />}
      </div>
      <button
        className="p-1 ml-1.5 mr-0.5 rounded hover:bg-[var(--tab-hover)] text-[var(--tab-text)] transition-colors shrink-0"
        style={{ marginTop: "auto", marginBottom: "auto" }}
        onClick={() => addTab()}
        title="New tab (Ctrl+T)"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      {/* ドラッグ領域: ドラッグで移動、ダブルクリックで最大化トグル */}
      <div
        className="flex-1"
        style={{ height: tabBarHeight }}
        onMouseDown={(e) => {
          if (e.button === 0) {
            getCurrentWindow().startDragging();
          }
        }}
        onDoubleClick={() => getCurrentWindow().toggleMaximize()}
      />

      <WindowControls height={tabBarHeight} />

      {/* ドラッグ中のゴーストタブ（カーソル追従） */}
      {draggingTabId && (
        <div
          ref={ghostRef}
          className="fixed z-50 pointer-events-none"
          style={{ left: -9999, top: -9999 }}
        >
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-md shadow-lg border border-[var(--chrome-border)] text-sm">
            <Folder className="w-3.5 h-3.5 text-[var(--folder-color)] shrink-0 fill-[var(--folder-fill)]" />
            <span className="truncate max-w-40">{draggingLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}
