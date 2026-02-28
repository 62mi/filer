export const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "bmp",
  "ico",
  "avif",
  "tiff",
  "tif",
]);

export const TEXT_EXTENSIONS = new Set([
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

/** HTML5 <video> で直接再生できる形式 */
export const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogv"]);

/** FFmpegサムネイル抽出が必要な動画形式 */
export const VIDEO_THUMBNAIL_EXTENSIONS = new Set(["mkv", "avi", "mov"]);

export const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "flac", "ogg", "aac", "wma"]);

export const PDF_EXTENSIONS = new Set(["pdf"]);

/** コードファイルかどうか判定する拡張子 */
export const CODE_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "rs", "py", "html", "css"]);

export type PreviewType =
  | "image"
  | "text"
  | "video"
  | "videoThumbnail"
  | "audio"
  | "pdf"
  | "unsupported";

export function getPreviewType(extension: string): PreviewType {
  const ext = extension.toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (TEXT_EXTENSIONS.has(ext)) return "text";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (VIDEO_THUMBNAIL_EXTENSIONS.has(ext)) return "videoThumbnail";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  return "unsupported";
}
