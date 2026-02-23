import { invoke } from "@tauri-apps/api/core";
import { FileCode, FileText, Folder, Image, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FileEntry } from "../../types";
import { formatDate, formatFileSize } from "../../utils/format";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"]);
const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "log",
  "csv",
  "json",
  "xml",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "ts",
  "tsx",
  "js",
  "jsx",
  "rs",
  "py",
  "html",
  "css",
  "scss",
  "less",
  "sh",
  "bat",
  "ps1",
  "c",
  "cpp",
  "h",
  "hpp",
  "java",
  "go",
  "rb",
  "php",
  "sql",
  "graphql",
  "env",
  "gitignore",
  "dockerfile",
]);

const MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
};

/** 長押しとみなす閾値(ms) */
const LONG_PRESS_MS = 200;

interface QuickLookProps {
  entry: FileEntry;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function QuickLook({ entry, onClose, onPrev, onNext }: QuickLookProps) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [contentKey, setContentKey] = useState(0);
  const prevPathRef = useRef(entry.path);

  // Space長押し/短押し管理
  // openedAt: QuickLookがマウントされた時刻
  const openedAtRef = useRef(Date.now());
  // spaceDownAt: 直近のSpace keydown時刻
  const spaceDownAtRef = useRef(0);
  // openingSpaceHandled: 最初のSpaceペア（開く操作）のkeyupを処理済みか
  const openingHandledRef = useRef(false);
  const closingRef = useRef(false);

  useEffect(() => {
    if (entry.path !== prevPathRef.current) {
      setContentKey((k) => k + 1);
      prevPathRef.current = entry.path;
    }
  }, [entry.path]);

  // コンテンツ読み込み
  useEffect(() => {
    if (entry.is_dir) {
      setTextContent(null);
      setImageDataUrl(null);
      return;
    }

    if (IMAGE_EXTENSIONS.has(entry.extension)) {
      setLoading(true);
      setTextContent(null);
      invoke<string>("read_image_base64", { path: entry.path })
        .then((base64) => {
          const mime = MIME_MAP[entry.extension] || "image/png";
          setImageDataUrl(`data:${mime};base64,${base64}`);
          setLoading(false);
        })
        .catch(() => {
          setImageDataUrl(null);
          setLoading(false);
        });
    } else if (TEXT_EXTENSIONS.has(entry.extension)) {
      setLoading(true);
      setImageDataUrl(null);
      invoke<string>("read_text_file", { path: entry.path, maxBytes: 100000 })
        .then((content) => {
          setTextContent(content);
          setLoading(false);
        })
        .catch(() => {
          setTextContent(null);
          setLoading(false);
        });
    } else {
      setTextContent(null);
      setImageDataUrl(null);
    }
  }, [entry]);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  /**
   * Space動作仕様:
   * - 短押し: Space↓で開く(Panel側) → Space↑(無視) → 次のSpace↓+↑で閉じる
   * - 長押し: Space↓で開く(Panel側) → Space↑(200ms以上後)で閉じる
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case " ":
          e.preventDefault();
          e.stopPropagation();
          if (e.repeat) break;
          spaceDownAtRef.current = Date.now();
          break;
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          handleClose();
          break;
        case "ArrowUp":
        case "ArrowLeft":
          e.preventDefault();
          e.stopPropagation();
          onPrev();
          break;
        case "ArrowDown":
        case "ArrowRight":
          e.preventDefault();
          e.stopPropagation();
          onNext();
          break;
      }
    },
    [handleClose, onPrev, onNext],
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== " ") return;
      e.preventDefault();
      e.stopPropagation();

      if (!openingHandledRef.current) {
        // これは「開く操作」のSpace↑
        openingHandledRef.current = true;
        // 長押し判定: マウントからの経過時間で判断
        const elapsed = Date.now() - openedAtRef.current;
        if (elapsed >= LONG_PRESS_MS) {
          // 長押し: 離したので閉じる
          handleClose();
        }
        // 短押し: 開いたまま維持
        return;
      }

      // 2回目以降のSpace↑ → 常に閉じる（短押しトグル or 長押し離し）
      handleClose();
    },
    [handleClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [handleKeyDown, handleKeyUp]);

  const isImage = IMAGE_EXTENSIONS.has(entry.extension);
  const isText = TEXT_EXTENSIONS.has(entry.extension);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${
        closing ? "animate-quicklook-backdrop-out" : "animate-quicklook-backdrop"
      }`}
      onClick={handleClose}
    >
      <div
        className={`relative bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl max-w-[80vw] max-h-[80vh] min-w-[420px] min-h-[320px] flex flex-col overflow-hidden ${
          closing ? "animate-quicklook-spring-out" : "animate-quicklook-spring"
        }`}
        style={{ boxShadow: "0 25px 60px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center h-10 px-4 bg-gradient-to-b from-[#f6f6f6] to-[#ececec] border-b border-[#d5d5d5] shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {entry.is_dir ? (
              <Folder className="w-4 h-4 text-amber-500 shrink-0" />
            ) : isImage ? (
              <Image className="w-4 h-4 text-[#666] shrink-0" />
            ) : isText ? (
              entry.extension &&
              ["ts", "tsx", "js", "jsx", "rs", "py", "html", "css"].includes(entry.extension) ? (
                <FileCode className="w-4 h-4 text-[#666] shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-[#666] shrink-0" />
              )
            ) : null}
            <span className="text-sm font-medium text-[#1a1a1a] truncate">{entry.name}</span>
            <span className="text-xs text-[#999] shrink-0 ml-1">
              {entry.is_dir ? "Folder" : formatFileSize(entry.size)}
            </span>
          </div>
          <button
            className="p-1 rounded-md hover:bg-black/5 text-[#666] transition-colors ml-2"
            onClick={handleClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* コンテンツ */}
        <div
          key={contentKey}
          className="flex-1 overflow-auto p-4 flex items-center justify-center animate-quicklook-content"
        >
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-[#0078d4] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-[#999]">Loading preview...</span>
            </div>
          ) : entry.is_dir ? (
            <div className="text-center text-[#999]">
              <Folder className="w-16 h-16 text-amber-400 mx-auto mb-3" />
              <div className="text-base font-medium text-[#1a1a1a] mb-1">{entry.name}</div>
              <div className="text-sm">Folder</div>
            </div>
          ) : isImage && imageDataUrl ? (
            <img
              src={imageDataUrl}
              alt={entry.name}
              className="max-w-full max-h-[70vh] object-contain rounded-md"
              style={{ imageRendering: "auto" }}
            />
          ) : isText && textContent !== null ? (
            <pre className="w-full h-full text-xs text-[#333] bg-[#f8f8f8] rounded-lg p-4 overflow-auto whitespace-pre-wrap break-all font-mono border border-[#e5e5e5] leading-relaxed">
              {textContent}
            </pre>
          ) : (
            <div className="text-center text-[#999]">
              <div className="w-16 h-16 bg-[#f0f0f0] rounded-2xl flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl font-bold text-[#bbb] uppercase">
                  {entry.extension || "?"}
                </span>
              </div>
              <div className="text-base font-medium text-[#1a1a1a] mb-1">{entry.name}</div>
              <div className="text-sm">{formatFileSize(entry.size)}</div>
              <div className="text-xs mt-1">{formatDate(entry.modified)}</div>
              <div className="text-xs mt-3 text-[#bbb]">No preview available</div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex items-center justify-center h-7 bg-gradient-to-b from-[#f0f0f0] to-[#e8e8e8] border-t border-[#d5d5d5] shrink-0">
          <span className="text-[10px] text-[#999] tracking-wide">
            Space / Esc to close &middot; ← → to navigate
          </span>
        </div>
      </div>
    </div>
  );
}
