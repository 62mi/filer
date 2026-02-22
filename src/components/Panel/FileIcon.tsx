import {
  Folder,
  File,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileCode,
  FileArchive,
  FileSpreadsheet,
  type LucideProps,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<LucideProps>> = {
  // テキスト
  txt: FileText,
  md: FileText,
  log: FileText,
  csv: FileSpreadsheet,
  // コード
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  rs: FileCode,
  py: FileCode,
  html: FileCode,
  css: FileCode,
  json: FileCode,
  toml: FileCode,
  yaml: FileCode,
  yml: FileCode,
  xml: FileCode,
  // 画像
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  svg: FileImage,
  webp: FileImage,
  bmp: FileImage,
  ico: FileImage,
  // 動画
  mp4: FileVideo,
  avi: FileVideo,
  mkv: FileVideo,
  mov: FileVideo,
  webm: FileVideo,
  // 音声
  mp3: FileAudio,
  wav: FileAudio,
  flac: FileAudio,
  ogg: FileAudio,
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
  if (isDir) {
    return <Folder className={className} />;
  }
  const Icon = iconMap[extension] || File;
  return <Icon className={className} />;
}
