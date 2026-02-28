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

/** Google Docs系ショートカットファイル */
export const GOOGLE_DOCS_EXTENSIONS = new Set(["gdoc", "gsheet", "gslides"]);

/** コードファイルかどうか判定する拡張子 */
export const CODE_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "rs", "py", "html", "css"]);

export type PreviewType =
  | "image"
  | "text"
  | "video"
  | "videoThumbnail"
  | "audio"
  | "pdf"
  | "googleDocs"
  | "unsupported";

export function getPreviewType(extension: string): PreviewType {
  const ext = extension.toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (TEXT_EXTENSIONS.has(ext)) return "text";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (VIDEO_THUMBNAIL_EXTENSIONS.has(ext)) return "videoThumbnail";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  if (GOOGLE_DOCS_EXTENSIONS.has(ext)) return "googleDocs";
  return "unsupported";
}

const GOOGLE_TYPE_MAP: Record<string, string> = {
  gdoc: "document",
  gsheet: "spreadsheets",
  gslides: "presentation",
};

/** Google Docsファイルの情報からプレビュー用URLと元URLを生成 */
export function buildGoogleDocsUrls(
  data: { url?: string; doc_id?: string },
  extension: string,
): { previewUrl: string; originalUrl: string } | null {
  const ext = extension.toLowerCase();
  const docType = GOOGLE_TYPE_MAP[ext];

  // doc_id からURL組み立て（新しいGoogle Drive形式）
  if (data.doc_id && docType) {
    const base = `https://docs.google.com/${docType}/d/${data.doc_id}`;
    return { previewUrl: `${base}/preview`, originalUrl: `${base}/edit` };
  }

  // url フィールドがある場合（旧形式）
  if (data.url) {
    const match = data.url.match(
      /https:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([^/]+)/,
    );
    if (match) {
      const base = `https://docs.google.com/${match[1]}/d/${match[2]}`;
      return { previewUrl: `${base}/preview`, originalUrl: data.url };
    }

    // open?id= 形式
    const openMatch = data.url.match(/[?&]id=([^&]+)/);
    if (openMatch && docType) {
      const base = `https://docs.google.com/${docType}/d/${openMatch[1]}`;
      return { previewUrl: `${base}/preview`, originalUrl: data.url };
    }

    return { previewUrl: data.url, originalUrl: data.url };
  }

  return null;
}
