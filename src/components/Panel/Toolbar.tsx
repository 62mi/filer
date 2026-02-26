import { LayoutGrid, List, Settings } from "lucide-react";
import { useTranslation } from "../../i18n";
import { useExplorerStore } from "../../stores/panelStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { cn } from "../../utils/cn";

export function Toolbar() {
  const t = useTranslation();
  const viewMode = useExplorerStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0];
    return tab.viewMode;
  });
  const setViewMode = useExplorerStore((s) => s.setViewMode);
  const toolbarHeight = useSettingsStore((s) => s.toolbarHeight);
  const uiFontSize = useSettingsStore((s) => s.uiFontSize);
  const openSettings = useSettingsStore((s) => s.openSettings);

  return (
    <div
      className="flex items-center px-2 gap-1 border-b border-[#e5e5e5] bg-[#fafafa] select-none shrink-0"
      style={{ height: toolbarHeight, fontSize: uiFontSize }}
    >
      <span className="text-[#666] mr-1">{t.toolbar.view}</span>
      <button
        className={cn(
          "flex items-center justify-center w-9 h-8 rounded transition-colors",
          viewMode === "details" ? "bg-[#e0e0e0] text-[#333]" : "text-[#888] hover:bg-[#e8e8e8]",
        )}
        onClick={() => setViewMode("details")}
        title={t.toolbar.details}
      >
        <List className="w-[18px] h-[18px]" />
      </button>
      <button
        className={cn(
          "flex items-center justify-center w-9 h-8 rounded transition-colors",
          viewMode === "icons" ? "bg-[#e0e0e0] text-[#333]" : "text-[#888] hover:bg-[#e8e8e8]",
        )}
        onClick={() => setViewMode("icons")}
        title={t.toolbar.mediumIcons}
      >
        <LayoutGrid className="w-[18px] h-[18px]" />
      </button>
      <div className="flex-1" />
      <button
        className="flex items-center justify-center w-8 h-8 rounded text-[#888] hover:bg-[#e8e8e8] transition-colors"
        onClick={openSettings}
        title={t.toolbar.settingsTooltip}
      >
        <Settings className="w-[16px] h-[16px]" />
      </button>
    </div>
  );
}
