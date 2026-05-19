import { Bookmark, Clock, Folder, FolderPlus, History, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "../../i18n";
import { type SuggestionItem, useSuggestionStore } from "../../stores/suggestionStore";

interface DragSuggestionProps {
  onSelectDestination: (destPath: string) => void;
  /** 「新規フォルダ作成して移動」アクション */
  onCreateFolderAndMove: (folderName: string) => void;
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

export function DragSuggestion({ onSelectDestination, onCreateFolderAndMove }: DragSuggestionProps) {
  const t = useTranslation();
  const visible = useSuggestionStore((s) => s.visible);
  const items = useSuggestionStore((s) => s.items);
  const selectedIndex = useSuggestionStore((s) => s.selectedIndex);
  const position = useSuggestionStore((s) => s.position);
  const createFolderMode = useSuggestionStore((s) => s.createFolderMode);
  const folderNameInput = useSuggestionStore((s) => s.folderNameInput);
  const setSelectedIndex = useSuggestionStore((s) => s.setSelectedIndex);
  const openCreateFolderMode = useSuggestionStore((s) => s.openCreateFolderMode);
  const closeCreateFolderMode = useSuggestionStore((s) => s.closeCreateFolderMode);
  const setFolderNameInput = useSuggestionStore((s) => s.setFolderNameInput);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
  }, [visible, createFolderMode]);

  // フォルダ作成モードに入ったら入力欄にフォーカス
  useEffect(() => {
    if (createFolderMode && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [createFolderMode]);

  // items が空でも「新規フォルダに入れる」アクションのために表示する
  if (!visible) return null;

  const handleCreateFolderClick = () => {
    setFolderNameInput(t.dragCreateFolder.defaultName);
    openCreateFolderMode();
  };

  const handleCreateFolderSubmit = () => {
    const name = folderNameInput.trim();
    if (!name) return;
    onCreateFolderAndMove(name);
    closeCreateFolderMode();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreateFolderSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeCreateFolderMode();
    }
  };

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

      {/* 新規フォルダ作成セクション */}
      <div className="border-t border-[#f0f0f0] mt-1 pt-1">
        {!createFolderMode ? (
          /* 「新規フォルダに入れる」: ドロップで作成 + F2リネームモード起動 */
          <button
            type="button"
            data-drop-zone="create-folder"
            className="flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors duration-75 hover:bg-[#f0f0f0] text-[#0078d4]"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCreateFolderClick();
            }}
          >
            <FolderPlus className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium">{t.dragCreateFolder.header}</span>
          </button>
        ) : (
          /* フォルダ名入力フォーム */
          <div className="px-3 py-2">
            <div className="text-[10px] font-semibold text-[#999] uppercase tracking-wider mb-1.5">
              {t.dragCreateFolder.header}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                type="text"
                value={folderNameInput}
                onChange={(e) => setFolderNameInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={t.dragCreateFolder.placeholder}
                className="flex-1 min-w-0 text-sm border border-[#d0d0d0] rounded px-2 py-1 outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]"
                onMouseDown={(e) => e.stopPropagation()}
              />
              {/* 作成ボタン */}
              <button
                type="button"
                className="shrink-0 text-xs font-medium px-2 py-1 bg-[#0078d4] text-white rounded hover:bg-[#106ebe] transition-colors disabled:opacity-40"
                disabled={!folderNameInput.trim()}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCreateFolderSubmit();
                }}
              >
                {t.dragCreateFolder.create}
              </button>
              {/* キャンセルボタン */}
              <button
                type="button"
                className="shrink-0 p-1 text-[#999] hover:text-[#333] transition-colors rounded"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  closeCreateFolderMode();
                }}
                title={t.dragCreateFolder.cancel}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* フッター */}
      <div className="px-3 py-1 text-[9px] text-[#bbb] border-t border-[#f0f0f0] text-center">
        Drop to move
      </div>
    </div>
  );
}
