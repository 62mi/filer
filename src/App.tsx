import { useState } from "react";
import { NavigationBar } from "./components/NavigationBar";
import { Panel } from "./components/Panel";
import { PreviewPanel } from "./components/PreviewPanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { useExplorerStore } from "./stores/panelStore";

function App() {
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [dragging, setDragging] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(280);
  const [previewDragging, setPreviewDragging] = useState(false);

  const tab = useExplorerStore((s) => s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0]);
  const cursorEntry = (tab.searchResults ?? tab.entries)[tab.cursorIndex] ?? null;

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
    </div>
  );
}

export default App;
