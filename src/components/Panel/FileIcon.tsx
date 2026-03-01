import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Folder,
  type LucideProps,
} from "lucide-react";
import { useIconStore } from "../../stores/iconStore";

const iconMap: Record<string, React.ComponentType<LucideProps>> = {
  // テキスト
  txt: FileText,
  md: FileText,
  mdx: FileText,
  log: FileText,
  csv: FileSpreadsheet,
  ini: FileText,
  cfg: FileText,
  conf: FileText,
  properties: FileText,
  editorconfig: FileText,
  diff: FileText,
  patch: FileText,
  // コード
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  rs: FileCode,
  py: FileCode,
  html: FileCode,
  css: FileCode,
  scss: FileCode,
  less: FileCode,
  json: FileCode,
  toml: FileCode,
  yaml: FileCode,
  yml: FileCode,
  xml: FileCode,
  graphql: FileCode,
  sh: FileCode,
  bat: FileCode,
  ps1: FileCode,
  c: FileCode,
  cpp: FileCode,
  h: FileCode,
  hpp: FileCode,
  java: FileCode,
  go: FileCode,
  rb: FileCode,
  php: FileCode,
  sql: FileCode,
  vue: FileCode,
  svelte: FileCode,
  astro: FileCode,
  swift: FileCode,
  kt: FileCode,
  kts: FileCode,
  dart: FileCode,
  r: FileCode,
  lua: FileCode,
  zig: FileCode,
  scala: FileCode,
  ex: FileCode,
  exs: FileCode,
  clj: FileCode,
  cs: FileCode,
  fs: FileCode,
  proto: FileCode,
  makefile: FileCode,
  cmake: FileCode,
  dockerfile: FileCode,
  tf: FileCode,
  hcl: FileCode,
  // 画像
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  jpe: FileImage,
  jfif: FileImage,
  gif: FileImage,
  svg: FileImage,
  webp: FileImage,
  bmp: FileImage,
  ico: FileImage,
  avif: FileImage,
  tiff: FileImage,
  tif: FileImage,
  apng: FileImage,
  cur: FileImage,
  // 動画
  mp4: FileVideo,
  avi: FileVideo,
  mkv: FileVideo,
  mov: FileVideo,
  webm: FileVideo,
  ogv: FileVideo,
  wmv: FileVideo,
  flv: FileVideo,
  m4v: FileVideo,
  "3gp": FileVideo,
  // 音声
  mp3: FileAudio,
  wav: FileAudio,
  flac: FileAudio,
  ogg: FileAudio,
  aac: FileAudio,
  wma: FileAudio,
  m4a: FileAudio,
  opus: FileAudio,
  // フォント
  ttf: FileType,
  otf: FileType,
  woff: FileType,
  woff2: FileType,
  // アーカイブ
  zip: FileArchive,
  "7z": FileArchive,
  rar: FileArchive,
  tar: FileArchive,
  gz: FileArchive,
};

interface FileIconProps {
  isDir: boolean;
  extension: string;
  className?: string;
}

export function FileIcon({ isDir, extension, className }: FileIconProps) {
  const iconUrl = useIconStore((s) => s.icons[isDir ? "__directory__" : extension]);

  if (iconUrl) {
    return <img src={iconUrl} alt="" className="w-4 h-4 mr-2 shrink-0" draggable={false} />;
  }

  if (isDir) {
    return <Folder className={className} />;
  }
  const Icon = iconMap[extension] || File;
  return <Icon className={className} />;
}
