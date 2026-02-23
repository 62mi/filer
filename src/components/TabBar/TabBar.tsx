import { Plus, X } from "lucide-react";
import { useExplorerStore } from "../../stores/panelStore";
import { cn } from "../../utils/cn";

export function TabBar() {
  const tabs = useExplorerStore((s) => s.tabs);
  const activeTabId = useExplorerStore((s) => s.activeTabId);
  const setActiveTab = useExplorerStore((s) => s.setActiveTab);
  const addTab = useExplorerStore((s) => s.addTab);
  const closeTab = useExplorerStore((s) => s.closeTab);

  return (
    <div className="flex items-center h-9 bg-[#f0f0f0] border-b border-[#e5e5e5] select-none shrink-0">
      <div className="flex items-end h-full overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const label = tab.path.split("\\").filter(Boolean).pop() || tab.path;
          return (
            <div
              key={tab.id}
              className={cn(
                "group flex items-center gap-1 h-full px-3 text-sm cursor-pointer border-r border-[#e0e0e0] max-w-48 min-w-0",
                isActive
                  ? "bg-white text-[#1a1a1a] border-t-2 border-t-[#0078d4]"
                  : "bg-[#f0f0f0] text-[#666] hover:bg-[#e8e8e8] border-t-2 border-t-transparent",
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
              <span className="truncate flex-1">{label}</span>
              {tabs.length > 1 && (
                <button
                  className="p-0.5 rounded hover:bg-[#d0d0d0] opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"
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
        className="p-1.5 mx-1 rounded hover:bg-[#e0e0e0] text-[#666] transition-colors shrink-0"
        onClick={() => addTab()}
        title="New tab (Ctrl+T)"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
