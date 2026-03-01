import { openPath } from "@tauri-apps/plugin-opener";
import {
  ExternalLink,
  FileAudio,
  FileCode,
  FileText,
  FileType,
  FileVideo,
  Folder,
  Globe,
  Image,
  Music,
  Play,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useImageControls } from "../../hooks/useImageControls";
import { usePreview } from "../../hooks/usePreview";
import { useTranslation } from "../../i18n";
import type { FileEntry } from "../../types";
import { formatDate, formatFileSize } from "../../utils/format";
import { CODE_EXTENSIONS } from "../../utils/previewConstants";
import { FontPreview } from "../FontPreview";
import { ImageToolbar } from "../ImageToolbar";

const PdfViewer = lazy(() =>
  import("../PdfViewer/PdfViewer").then((m) => ({ default: m.PdfViewer })),
);
const MarkdownPreview = lazy(() =>
  import("../MarkdownPreview/MarkdownPreview").then((m) => ({ default: m.MarkdownPreview })),
);
const CodePreview = lazy(() =>
  import("../CodePreview/CodePreview").then((m) => ({ default: m.CodePreview })),
);
const PsdPreview = lazy(() =>
  import("../PsdPreview/PsdPreview").then((m) => ({ default: m.PsdPreview })),
);

/** 長押しとみなす閾値(ms) */
const LONG_PRESS_MS = 200;

interface QuickLookProps {
  entry: FileEntry;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function QuickLook({ entry, onClose, onPrev, onNext }: QuickLookProps) {
  const t = useTranslation();
  const preview = usePreview(entry, { maxTextBytes: 100000 });
  const controls = useImageControls(entry.path);
  const [closing, setClosing] = useState(false);
  const [imgVersion, setImgVersion] = useState(0);
  const [contentKey, setContentKey] = useState(0);
  const prevPathRef = useRef(entry.path);

  // Space長押し/短押し管理
  const openedAtRef = useRef(Date.now());
  const spaceDownAtRef = useRef(0);
  const openingHandledRef = useRef(false);
  const closingRef = useRef(false);

  useEffect(() => {
    if (entry.path !== prevPathRef.current) {
      setContentKey((k) => k + 1);
      prevPathRef.current = entry.path;
    }
  }, [entry.path]);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

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
        openingHandledRef.current = true;
        const elapsed = Date.now() - openedAtRef.current;
        if (elapsed >= LONG_PRESS_MS) {
          handleClose();
        }
        return;
      }

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

  // ヘッダーアイコン
  function renderHeaderIcon() {
    if (entry.is_dir) return <Folder className="w-4 h-4 text-amber-500 shrink-0" />;
    switch (preview.type) {
      case "image":
        return <Image className="w-4 h-4 text-[#666] shrink-0" />;
      case "video":
      case "videoThumbnail":
        return <FileVideo className="w-4 h-4 text-[#666] shrink-0" />;
      case "audio":
        return <FileAudio className="w-4 h-4 text-[#666] shrink-0" />;
      case "font":
        return <FileType className="w-4 h-4 text-[#666] shrink-0" />;
      case "psd":
        return <Image className="w-4 h-4 text-[#666] shrink-0" />;
      case "text":
        return CODE_EXTENSIONS.has(entry.extension) ? (
          <FileCode className="w-4 h-4 text-[#666] shrink-0" />
        ) : (
          <FileText className="w-4 h-4 text-[#666] shrink-0" />
        );
      case "pdf":
        return <FileText className="w-4 h-4 text-[#666] shrink-0" />;
      case "googleDocs":
        return <Globe className="w-4 h-4 text-[#666] shrink-0" />;
      default:
        return null;
    }
  }

  // コンテンツ
  function renderContent() {
    if (preview.loading) {
      return (
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-[#0078d4] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-[#999]">Loading preview...</span>
        </div>
      );
    }

    if (entry.is_dir) {
      return (
        <div className="text-center text-[#999]">
          <Folder className="w-16 h-16 text-amber-400 mx-auto mb-3" />
          <div className="text-base font-medium text-[#1a1a1a] mb-1">{entry.name}</div>
          <div className="text-sm">Folder</div>
        </div>
      );
    }

    switch (preview.type) {
      case "image":
        return preview.imageUrl ? (
          <div
            ref={controls.containerRef}
            className="group relative w-full h-full flex items-center justify-center overflow-hidden"
            onMouseDown={controls.onMouseDown}
          >
            <img
              src={preview.imageUrl + (imgVersion ? `?v=${imgVersion}` : "")}
              alt={entry.name}
              className="max-w-full max-h-[70vh] object-contain select-none"
              style={{ ...controls.transformStyle, imageRendering: "auto" }}
              draggable={false}
            />
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <ImageToolbar
                extension={entry.extension}
                filePath={entry.path}
                rotation={controls.rotation}
                flipH={controls.flipH}
                flipV={controls.flipV}
                isModified={controls.isModified}
                isTransformed={controls.isTransformed}
                zoomPercent={controls.zoomPercent}
                onZoomIn={controls.zoomIn}
                onZoomOut={controls.zoomOut}
                onRotateCcw={controls.rotateCcw}
                onRotateCw={controls.rotateCw}
                onFlipH={controls.toggleFlipH}
                onFlipV={controls.toggleFlipV}
                onReset={controls.resetAll}
                onSaved={() => {
                  controls.resetAfterSave();
                  setImgVersion((v) => v + 1);
                }}
              />
            </div>
          </div>
        ) : null;

      case "text":
        if (preview.textContent === null) return null;
        if (entry.extension === "md" || entry.extension === "mdx") {
          return (
            <div className="w-full max-w-3xl max-h-[70vh] overflow-auto p-4">
              <Suspense
                fallback={
                  <pre className="text-xs font-mono whitespace-pre-wrap">{preview.textContent}</pre>
                }
              >
                <MarkdownPreview content={preview.textContent} />
              </Suspense>
            </div>
          );
        }
        if (CODE_EXTENSIONS.has(entry.extension)) {
          return (
            <div className="w-full max-w-4xl max-h-[70vh] overflow-auto">
              <Suspense
                fallback={
                  <pre className="text-xs font-mono whitespace-pre-wrap p-4">
                    {preview.textContent}
                  </pre>
                }
              >
                <CodePreview content={preview.textContent} extension={entry.extension} />
              </Suspense>
            </div>
          );
        }
        return (
          <pre className="w-full h-full text-xs text-[#333] bg-[#f8f8f8] rounded-lg p-4 overflow-auto whitespace-pre-wrap break-all font-mono border border-[#e5e5e5] leading-relaxed">
            {preview.textContent}
          </pre>
        );

      case "psd":
        return preview.imageUrl ? (
          <div
            ref={controls.containerRef}
            className="group relative w-full h-full flex items-center justify-center overflow-hidden"
            onMouseDown={controls.onMouseDown}
          >
            <Suspense
              fallback={
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-[#0078d4] border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-[#999]">Loading PSD...</span>
                </div>
              }
            >
              <div style={controls.transformStyle}>
                <PsdPreview url={preview.imageUrl} filePath={entry.path} name={entry.name} />
              </div>
            </Suspense>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <ImageToolbar
                extension={entry.extension}
                filePath={entry.path}
                rotation={controls.rotation}
                flipH={controls.flipH}
                flipV={controls.flipV}
                isModified={controls.isModified}
                isTransformed={controls.isTransformed}
                zoomPercent={controls.zoomPercent}
                onZoomIn={controls.zoomIn}
                onZoomOut={controls.zoomOut}
                onRotateCcw={controls.rotateCcw}
                onRotateCw={controls.rotateCw}
                onFlipH={controls.toggleFlipH}
                onFlipV={controls.toggleFlipV}
                onReset={controls.resetAll}
                onSaved={controls.resetAfterSave}
              />
            </div>
          </div>
        ) : null;

      case "video":
        return preview.mediaUrl ? (
          <video src={preview.mediaUrl} controls className="max-w-full max-h-[70vh] rounded-md">
            <track kind="captions" />
          </video>
        ) : null;

      case "audio":
        return (
          <div className="flex flex-col items-center gap-4 w-full max-w-md">
            <Music className="w-16 h-16 text-[#bbb]" />
            <div className="text-base font-medium text-[#1a1a1a]">{entry.name}</div>
            {preview.mediaUrl && (
              <audio src={preview.mediaUrl} controls className="w-full">
                <track kind="captions" />
              </audio>
            )}
          </div>
        );

      case "videoThumbnail":
        return preview.videoThumbnail ? (
          <div
            ref={controls.containerRef}
            className="group relative w-full h-full flex items-center justify-center overflow-hidden"
            onMouseDown={controls.onMouseDown}
          >
            <div className="relative" style={controls.transformStyle}>
              <img
                src={preview.videoThumbnail}
                alt={entry.name}
                className="max-w-full max-h-[70vh] object-contain rounded-md select-none"
                draggable={false}
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-12 h-12 bg-black/50 rounded-full flex items-center justify-center">
                  <Play className="w-6 h-6 text-white ml-0.5" />
                </div>
              </div>
            </div>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <ImageToolbar
                extension={entry.extension}
                filePath={entry.path}
                rotation={controls.rotation}
                flipH={controls.flipH}
                flipV={controls.flipV}
                isModified={controls.isModified}
                isTransformed={controls.isTransformed}
                zoomPercent={controls.zoomPercent}
                onZoomIn={controls.zoomIn}
                onZoomOut={controls.zoomOut}
                onRotateCcw={controls.rotateCcw}
                onRotateCw={controls.rotateCw}
                onFlipH={controls.toggleFlipH}
                onFlipV={controls.toggleFlipV}
                onReset={controls.resetAll}
                onSaved={controls.resetAfterSave}
              />
            </div>
          </div>
        ) : (
          <div className="text-center text-[#999]">
            <FileVideo className="w-16 h-16 text-[#bbb] mx-auto mb-3" />
            <div className="text-base font-medium text-[#1a1a1a] mb-1">{entry.name}</div>
            <div className="text-xs mt-3 text-[#bbb]">FFmpeg required for preview</div>
          </div>
        );

      case "font":
        return preview.fontUrl ? (
          <div className="w-full max-w-2xl overflow-auto max-h-[70vh] p-4">
            <FontPreview url={preview.fontUrl} name={entry.name} />
          </div>
        ) : null;

      case "pdf":
        return preview.pdfUrl ? (
          <div className="flex flex-col" style={{ width: "70vw", height: "65vh" }}>
            <Suspense
              fallback={
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-[#0078d4] border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-[#999]">Loading PDF...</span>
                </div>
              }
            >
              <PdfViewer url={preview.pdfUrl} />
            </Suspense>
          </div>
        ) : null;

      case "googleDocs":
        return preview.googleDocsUrl ? (
          <div className="flex flex-col" style={{ width: "70vw", height: "65vh" }}>
            <iframe
              src={preview.googleDocsUrl}
              className="flex-1 w-full rounded-md border border-[#e5e5e5]"
              title={entry.name}
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
            {preview.googleDocsOriginalUrl && (
              <div className="flex justify-center mt-2 shrink-0">
                <a
                  href={preview.googleDocsOriginalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[var(--accent)] hover:opacity-80"
                >
                  <ExternalLink className="w-3 h-3" />
                  {t.settingsDialog.openInBrowser}
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-[#999]">
            <Globe className="w-16 h-16 text-[#bbb] mx-auto mb-3" />
            <div className="text-base font-medium text-[#1a1a1a] mb-1">{entry.name}</div>
            {preview.googleDocsReadFailed ? (
              <button
                className="mt-3 flex items-center gap-1.5 mx-auto px-4 py-2 text-xs rounded bg-[var(--accent)] text-white hover:opacity-90 transition-colors"
                onClick={() => openPath(entry.path)}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {t.settingsDialog.openInBrowser}
              </button>
            ) : (
              <div className="text-xs mt-3 text-[#bbb]">No preview available</div>
            )}
          </div>
        );

      default:
        return (
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
        );
    }
  }

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
        {/* Header */}
        <div className="flex items-center h-10 px-4 bg-gradient-to-b from-[#f6f6f6] to-[#ececec] border-b border-[#d5d5d5] shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {renderHeaderIcon()}
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

        {/* Content */}
        <div
          key={contentKey}
          className="flex-1 overflow-auto p-4 flex items-center justify-center animate-quicklook-content"
        >
          {renderContent()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center h-7 bg-gradient-to-b from-[#f0f0f0] to-[#e8e8e8] border-t border-[#d5d5d5] shrink-0">
          <span className="text-[10px] text-[#999] tracking-wide">
            Space / Esc to close &middot; ← → to navigate
          </span>
        </div>
      </div>
    </div>
  );
}
