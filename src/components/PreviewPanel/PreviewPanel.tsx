import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, FileText, Image, FileCode } from "lucide-react";
import { formatFileSize, formatDate } from "../../utils/format";
import type { FileEntry } from "../../types";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"]);
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "log", "csv", "json", "xml", "yaml", "yml", "toml", "ini", "cfg",
  "ts", "tsx", "js", "jsx", "rs", "py", "html", "css", "scss", "less",
  "sh", "bat", "ps1", "c", "cpp", "h", "hpp", "java", "go", "rb", "php",
  "sql", "graphql", "env", "gitignore", "dockerfile",
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

interface PreviewPanelProps {
  entry: FileEntry | null;
  onClose: () => void;
}

export function PreviewPanel({ entry, onClose }: PreviewPanelProps) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entry || entry.is_dir) {
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
      invoke<string>("read_text_file", { path: entry.path, maxBytes: 50000 })
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

  if (!entry) return null;

  const isImage = IMAGE_EXTENSIONS.has(entry.extension);
  const isText = TEXT_EXTENSIONS.has(entry.extension);

  return (
    <div className="flex flex-col h-full bg-white border-l border-[#e5e5e5]">
      {/* Header */}
      <div className="flex items-center h-8 px-3 bg-[#fafafa] border-b border-[#e5e5e5] shrink-0">
        <span className="text-xs font-semibold text-[#666] flex-1">Preview</span>
        <button
          className="p-0.5 rounded hover:bg-[#e0e0e0] text-[#999]"
          onClick={onClose}
          title="Close preview"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {entry.is_dir ? (
          <div className="flex flex-col items-center justify-center h-full text-[#999]">
            <div className="text-sm font-medium text-[#1a1a1a] mb-1 text-center break-all">
              {entry.name}
            </div>
            <div className="text-xs">Folder</div>
          </div>
        ) : isImage ? (
          <div className="flex flex-col items-center">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-xs text-[#999]">Loading...</div>
            ) : imageDataUrl ? (
              <img
                src={imageDataUrl}
                alt={entry.name}
                className="max-w-full max-h-[400px] object-contain rounded border border-[#e5e5e5]"
              />
            ) : (
              <div className="flex items-center justify-center h-32 text-xs text-[#999]">Unable to load image</div>
            )}
            <div className="mt-3 text-xs text-[#666] text-center space-y-0.5">
              <div className="font-medium text-[#1a1a1a]">{entry.name}</div>
              <div>{formatFileSize(entry.size)}</div>
              <div>{formatDate(entry.modified)}</div>
            </div>
          </div>
        ) : isText ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-1 mb-2">
              {entry.extension && ["ts", "tsx", "js", "jsx", "rs", "py", "html", "css"].includes(entry.extension)
                ? <FileCode className="w-3.5 h-3.5 text-[#666]" />
                : <FileText className="w-3.5 h-3.5 text-[#666]" />
              }
              <span className="text-xs font-medium text-[#1a1a1a] truncate">{entry.name}</span>
            </div>
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-xs text-[#999]">Loading...</div>
            ) : textContent !== null ? (
              <pre className="flex-1 text-xs text-[#333] bg-[#f8f8f8] rounded p-2 overflow-auto whitespace-pre-wrap break-all font-mono border border-[#e5e5e5]">
                {textContent}
              </pre>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-[#999]">
                Unable to preview
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-[#999]">
            <Image className="w-8 h-8 mb-2" />
            <div className="text-sm font-medium text-[#1a1a1a] mb-1 text-center break-all">
              {entry.name}
            </div>
            <div className="text-xs">{formatFileSize(entry.size)}</div>
            <div className="text-xs mt-0.5">No preview available</div>
          </div>
        )}
      </div>
    </div>
  );
}
