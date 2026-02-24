import { getCurrentWindow } from "@tauri-apps/api/window";
import { Folder, Plus, Sparkles, X } from "lucide-react";
import { useAiStore } from "../../stores/aiStore";
import { useExplorerStore } from "../../stores/panelStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { cn } from "../../utils/cn";
import { WindowControls } from "./WindowControls";

export function TabBar() {
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

  return (
    <div
      className="flex items-end bg-[#e8e8e8] select-none shrink-0 relative"
      style={{ height: tabBarHeight, fontSize: uiFontSize }}
    >
      {/* タブバー下端のセパレータライン（アクティブタブが覆う） */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-[#e0e0e0] z-0" />

      <div className="flex items-end h-full overflow-x-auto pl-3 gap-px pt-1.5">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const label = tab.path.split("\\").filter(Boolean).pop() || tab.path;
          const hasAi = aiDialogOpen && aiDialogTabId === tab.id;
          return (
            <div
              key={tab.id}
              className={cn(
                "group flex items-center gap-1.5 px-3 cursor-pointer max-w-52 min-w-0 rounded-t-[6px]",
                "transition-[background-color,color] duration-100 ease-out",
                isActive
                  ? "bg-white text-[#1a1a1a] relative z-10 h-full"
                  : "bg-transparent text-[#666] hover:bg-[#dedede] h-[calc(100%-2px)]",
              )}
              onClick={() => setActiveTab(tab.id)}
              onMouseDown={(e) => {
                // Middle-click to close
                if (e.button === 1 && tabs.length > 1) {
                  e.preventDefault();
                  closeTab(tab.id);
                }
              }}
              title={tab.path}
            >
              <Folder className="w-3.5 h-3.5 text-[#e8a520] shrink-0 fill-[#f2c55c]" />
              {hasAi && (
                <Sparkles
                  className={cn("w-3 h-3 text-purple-500 shrink-0", aiLoading && "animate-pulse")}
                />
              )}
              <span className="truncate flex-1">{label}</span>
              {tabs.length > 1 && (
                <button
                  className={cn(
                    "p-0.5 rounded hover:bg-[#d0d0d0] shrink-0 transition-opacity",
                    isActive ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-100",
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
          );
        })}
      </div>
      <button
        className="p-1 mx-0.5 mb-1 rounded hover:bg-[#d8d8d8] text-[#666] transition-colors shrink-0"
        onClick={() => addTab()}
        title="New tab (Ctrl+T)"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      {/* ドラッグ領域: ドラッグで移動、ダブルクリックで最大化トグル */}
      <div
        className="flex-1 h-full"
        onMouseDown={(e) => {
          if (e.button === 0) {
            getCurrentWindow().startDragging();
          }
        }}
        onDoubleClick={() => getCurrentWindow().toggleMaximize()}
      />

      <WindowControls />
    </div>
  );
}
