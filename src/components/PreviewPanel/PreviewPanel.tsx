import { openPath } from "@tauri-apps/plugin-opener";
import {
  ExternalLink,
  FileAudio,
  FileCode,
  FileText,
  FileType,
  FileVideo,
  Globe,
  Image,
  Music,
  Play,
  X,
} from "lucide-react";
import { lazy, Suspense } from "react";
import { useTranslation } from "../../i18n";
import { usePreview } from "../../hooks/usePreview";
import type { FileEntry } from "../../types";
import { formatDate, formatFileSize } from "../../utils/format";
import { CODE_EXTENSIONS } from "../../utils/previewConstants";
import { FontPreview } from "../FontPreview";

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

interface PreviewPanelProps {
  entry: FileEntry | null;
  onClose: () => void;
}

export function PreviewPanel({ entry, onClose }: PreviewPanelProps) {
  const t = useTranslation();
  const preview = usePreview(entry, { maxTextBytes: 50000 });

  if (!entry) return null;

  // early returnの後なのでentryは非null確定だが、
  // TSはネスト関数で認識しないためローカル変数に束縛
  const e = entry;

  function renderHeaderIcon() {
    switch (preview.type) {
      case "image":
        return <Image className="w-3.5 h-3.5 text-[#666]" />;
      case "video":
      case "videoThumbnail":
        return <FileVideo className="w-3.5 h-3.5 text-[#666]" />;
      case "audio":
        return <FileAudio className="w-3.5 h-3.5 text-[#666]" />;
      case "font":
        return <FileType className="w-3.5 h-3.5 text-[#666]" />;
      case "psd":
        return <Image className="w-3.5 h-3.5 text-[#666]" />;
      case "text":
        return CODE_EXTENSIONS.has(e.extension) ? (
          <FileCode className="w-3.5 h-3.5 text-[#666]" />
        ) : (
          <FileText className="w-3.5 h-3.5 text-[#666]" />
        );
      case "pdf":
        return <FileText className="w-3.5 h-3.5 text-[#666]" />;
      case "googleDocs":
        return <Globe className="w-3.5 h-3.5 text-[#666]" />;
      default:
        return null;
    }
  }

  function renderContent() {
    if (e.is_dir) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-[#999]">
          <div className="text-sm font-medium text-[#1a1a1a] mb-1 text-center break-all">
            {e.name}
          </div>
          <div className="text-xs">Folder</div>
        </div>
      );
    }

    switch (preview.type) {
      case "image":
        return (
          <div className="flex flex-col items-center">
            {preview.loading ? (
              <div className="flex items-center justify-center h-32 text-xs text-[#999]">
                Loading...
              </div>
            ) : preview.imageUrl ? (
              <img
                src={preview.imageUrl}
                alt={e.name}
                className="max-w-full max-h-[400px] object-contain rounded"
                style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.15))" }}
              />
            ) : (
              <div className="flex items-center justify-center h-32 text-xs text-[#999]">
                Unable to load image
              </div>
            )}
            <div className="mt-3 text-xs text-[#666] text-center space-y-0.5">
              <div className="font-medium text-[#1a1a1a]">{e.name}</div>
              <div>{formatFileSize(e.size)}</div>
              <div>{formatDate(e.modified)}</div>
            </div>
          </div>
        );

      case "text":
        return (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-1 mb-2">
              {renderHeaderIcon()}
              <span className="text-xs font-medium text-[#1a1a1a] truncate">{e.name}</span>
            </div>
            {preview.loading ? (
              <div className="flex-1 flex items-center justify-center text-xs text-[#999]">
                Loading...
              </div>
            ) : preview.textContent !== null ? (
              (e.extension === "md" || e.extension === "mdx") ? (
                <div className="flex-1 overflow-auto">
                  <Suspense fallback={<pre className="text-xs font-mono whitespace-pre-wrap p-2">{preview.textContent}</pre>}>
                    <MarkdownPreview content={preview.textContent} />
                  </Suspense>
                </div>
              ) : CODE_EXTENSIONS.has(e.extension) ? (
                <div className="flex-1 overflow-auto">
                  <Suspense fallback={<pre className="text-xs font-mono whitespace-pre-wrap p-2">{preview.textContent}</pre>}>
                    <CodePreview content={preview.textContent} extension={e.extension} fontSize={11} />
                  </Suspense>
                </div>
              ) : (
                <pre className="flex-1 text-xs text-[#333] bg-[#f8f8f8] rounded p-2 overflow-auto whitespace-pre-wrap break-all font-mono border border-[#e5e5e5]">
                  {preview.textContent}
                </pre>
              )
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-[#999]">
                Unable to preview
              </div>
            )}
          </div>
        );

      case "psd":
        return (
          <div className="flex flex-col items-center">
            {preview.imageUrl ? (
              <Suspense
                fallback={
                  <div className="flex items-center justify-center h-32 text-xs text-[#999]">
                    Loading PSD...
                  </div>
                }
              >
                <PsdPreview url={preview.imageUrl} filePath={e.path} name={e.name} maxHeight="400px" />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-32 text-xs text-[#999]">
                Unable to load PSD
              </div>
            )}
            <div className="mt-3 text-xs text-[#666] text-center space-y-0.5">
              <div className="font-medium text-[#1a1a1a]">{e.name}</div>
              <div>{formatFileSize(e.size)}</div>
            </div>
          </div>
        );

      case "video":
        return (
          <div className="flex flex-col items-center">
            {preview.mediaUrl ? (
              <video src={preview.mediaUrl} controls className="max-w-full max-h-[400px] rounded">
                <track kind="captions" />
              </video>
            ) : (
              <div className="flex items-center justify-center h-32 text-xs text-[#999]">
                Unable to load video
              </div>
            )}
            <div className="mt-3 text-xs text-[#666] text-center space-y-0.5">
              <div className="font-medium text-[#1a1a1a]">{e.name}</div>
              <div>{formatFileSize(e.size)}</div>
            </div>
          </div>
        );

      case "audio":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-3 w-full">
            <Music className="w-10 h-10 text-[#bbb]" />
            <div className="text-xs font-medium text-[#1a1a1a] text-center break-all">{e.name}</div>
            {preview.mediaUrl && (
              <audio src={preview.mediaUrl} controls className="w-full">
                <track kind="captions" />
              </audio>
            )}
            <div className="text-xs text-[#666]">{formatFileSize(e.size)}</div>
          </div>
        );

      case "videoThumbnail":
        return (
          <div className="flex flex-col items-center">
            {preview.loading ? (
              <div className="flex items-center justify-center h-32 text-xs text-[#999]">
                Loading...
              </div>
            ) : preview.videoThumbnail ? (
              <div className="relative">
                <img
                  src={preview.videoThumbnail}
                  alt={e.name}
                  className="max-w-full max-h-[400px] object-contain rounded"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center">
                    <Play className="w-5 h-5 text-white ml-0.5" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-xs text-[#999]">
                <FileVideo className="w-8 h-8 mb-2" />
                <div>FFmpeg required for preview</div>
              </div>
            )}
            <div className="mt-3 text-xs text-[#666] text-center space-y-0.5">
              <div className="font-medium text-[#1a1a1a]">{e.name}</div>
              <div>{formatFileSize(e.size)}</div>
            </div>
          </div>
        );

      case "font":
        return (
          <div className="flex flex-col h-full overflow-auto">
            <div className="flex items-center gap-1 mb-2">
              <FileType className="w-3.5 h-3.5 text-[#666]" />
              <span className="text-xs font-medium text-[#1a1a1a] truncate">{e.name}</span>
            </div>
            {preview.fontUrl ? (
              <FontPreview url={preview.fontUrl} name={e.name} compact />
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-[#999]">
                Unable to load font
              </div>
            )}
          </div>
        );

      case "pdf":
        return (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-1 mb-2">
              <FileText className="w-3.5 h-3.5 text-[#666]" />
              <span className="text-xs font-medium text-[#1a1a1a] truncate">{e.name}</span>
            </div>
            {preview.pdfUrl ? (
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center text-xs text-[#999]">
                    Loading PDF...
                  </div>
                }
              >
                <PdfViewer url={preview.pdfUrl} />
              </Suspense>
            ) : null}
          </div>
        );

      case "googleDocs":
        return (
          <div className="flex flex-col h-full min-h-0">
            <div className="flex items-center gap-1 mb-2 shrink-0">
              <Globe className="w-3.5 h-3.5 text-[#666]" />
              <span className="text-xs font-medium text-[#1a1a1a] truncate">{e.name}</span>
            </div>
            {preview.googleDocsUrl ? (
              <>
                <iframe
                  src={preview.googleDocsUrl}
                  className="flex-1 w-full rounded border border-[#e5e5e5] min-h-0"
                  title={e.name}
                  sandbox="allow-scripts allow-same-origin allow-popups"
                />
                {preview.googleDocsOriginalUrl && (
                  <div className="flex justify-center mt-2">
                    <a
                      href={preview.googleDocsOriginalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:opacity-80"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {t.settingsDialog.openInBrowser}
                    </a>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2">
                {preview.googleDocsReadFailed ? (
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-[var(--accent)] text-white hover:opacity-90 transition-colors"
                    onClick={() => openPath(e.path)}
                  >
                    <ExternalLink className="w-3 h-3" />
                    {t.settingsDialog.openInBrowser}
                  </button>
                ) : (
                  <span className="text-xs text-[#999]">Unable to preview</span>
                )}
              </div>
            )}
          </div>
        );

      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-[#999]">
            <Image className="w-8 h-8 mb-2" />
            <div className="text-sm font-medium text-[#1a1a1a] mb-1 text-center break-all">
              {e.name}
            </div>
            <div className="text-xs">{formatFileSize(e.size)}</div>
            <div className="text-xs mt-0.5">No preview available</div>
          </div>
        );
    }
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-[rgba(var(--accent-rgb),0.2)]">
      {/* Header */}
      <div className="flex items-center h-8 px-3 bg-[#fafafa] border-b border-[#e5e5e5] shrink-0">
        <span className="text-xs font-semibold text-[#666] flex-1">Preview</span>
        <button
          className="p-0.5 rounded hover:bg-[#e0e0e0] text-[#999] transition-colors duration-100"
          onClick={onClose}
          title="Close preview"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div key={e.path} className="flex-1 overflow-auto p-3 animate-fade-in">
        {renderContent()}
      </div>
    </div>
  );
}
