import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  type LucideProps,
} from "lucide-react";
import { useIconStore } from "../../stores/iconStore";

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
