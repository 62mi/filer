import { Bookmark, Clock, Folder, History } from "lucide-react";
import { useEffect, useRef } from "react";
import { type SuggestionItem, useSuggestionStore } from "../../stores/suggestionStore";

interface DragSuggestionProps {
  onSelectDestination: (destPath: string) => void;
}

function SourceBadge({ source }: { source: SuggestionItem["source"] }) {
  switch (source) {
    case "history":
      return <History className="w-3 h-3 text-[#0078d4]" />;
    case "bookmark":
      return <Bookmark className="w-3 h-3 text-amber-500" />;
    case "recent":
      return <Clock className="w-3 h-3 text-green-500" />;
    case "mixed":
      return <History className="w-3 h-3 text-purple-500" />;
  }
}

export function DragSuggestion({ onSelectDestination }: DragSuggestionProps) {
  const visible = useSuggestionStore((s) => s.visible);
  const items = useSuggestionStore((s) => s.items);
  const selectedIndex = useSuggestionStore((s) => s.selectedIndex);
  const position = useSuggestionStore((s) => s.position);
  const setSelectedIndex = useSuggestionStore((s) => s.setSelectedIndex);
  const panelRef = useRef<HTMLDivElement>(null);

  // ビューポート端の自動調整
  useEffect(() => {
    if (!panelRef.current || !visible) return;
    const el = panelRef.current;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      el.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
  }, [visible]);

  if (!visible || items.length === 0) return null;

  return (
    <div
      ref={panelRef}
      className="fixed z-50 w-72 bg-white border border-[#e0e0e0] rounded-lg shadow-lg py-1 animate-suggestion-in"
      style={{ left: position.x + 24, top: position.y + 32 }}
    >
      {/* ヘッダー */}
      <div className="px-3 py-1.5 text-[10px] font-semibold text-[#999] uppercase tracking-wider border-b border-[#f0f0f0]">
        Move to...
      </div>

      {/* サジェスト項目: ネイティブドラッグ時は tauri://drag-drop + data-drop-zone で処理 */}
      {items.map((item, i) => (
        <div
          key={item.path}
          data-suggestion-index={i}
          data-drop-zone="suggestion"
          data-suggestion-path={item.path}
          className={`flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors duration-75 ${
            i === selectedIndex ? "bg-[#cce8ff]" : "hover:bg-[#f0f0f0]"
          }`}
          onMouseEnter={() => setSelectedIndex(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelectDestination(item.path);
          }}
        >
          <Folder className="w-4 h-4 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate text-[#1a1a1a]">{item.displayName}</div>
            <div className="text-[10px] text-[#999] truncate">{item.displayPath}</div>
          </div>
          <SourceBadge source={item.source} />
        </div>
      ))}

      {/* フッター */}
      <div className="px-3 py-1 text-[9px] text-[#bbb] border-t border-[#f0f0f0] text-center">
        Drop to move
      </div>
    </div>
  );
}
