// lucide-react モック — 3308個のアイコンファイル解決を回避
// resolve.alias で本モジュールの代わりに読み込まれる
// プロジェクトで使用される全アイコンを軽量コンポーネントとしてエクスポート
import { createElement, type ReactNode } from "react";

function icon(name: string) {
  const Component = (props: Record<string, unknown>): ReactNode => {
    const { children: _c, ...rest } = props;
    return createElement("span", { "data-icon": name, ...rest });
  };
  Component.displayName = name;
  return Component;
}

// プロジェクト内で使用されているアイコン一覧（アルファベット順）
export const AlertTriangle = icon("AlertTriangle");
export const ArrowLeft = icon("ArrowLeft");
export const BarChart3 = icon("BarChart3");
export const ArrowRight = icon("ArrowRight");
export const ArrowUp = icon("ArrowUp");
export const Bookmark = icon("Bookmark");
export const Check = icon("Check");
export const ChevronDown = icon("ChevronDown");
export const ChevronRight = icon("ChevronRight");
export const ChevronUp = icon("ChevronUp");
export const ClipboardList = icon("ClipboardList");
export const ClipboardPaste = icon("ClipboardPaste");
export const Clock = icon("Clock");
export const Command = icon("Command");
export const Copy = icon("Copy");
export const DollarSign = icon("DollarSign");
export const Download = icon("Download");
export const Eye = icon("Eye");
export const EyeOff = icon("EyeOff");
export const ExternalLink = icon("ExternalLink");
export const File = icon("File");
export const FileArchive = icon("FileArchive");
export const FlipHorizontal = icon("FlipHorizontal");
export const FlipVertical = icon("FlipVertical");
export const FileAudio = icon("FileAudio");
export const FileCode = icon("FileCode");
export const FileImage = icon("FileImage");
export const FilePlus = icon("FilePlus");
export const FileSpreadsheet = icon("FileSpreadsheet");
export const FileText = icon("FileText");
export const FileType = icon("FileType");
export const FileVideo = icon("FileVideo");
export const Folder = icon("Folder");
export const FolderOpen = icon("FolderOpen");
export const FolderPlus = icon("FolderPlus");
export const Globe = icon("Globe");
export const GripVertical = icon("GripVertical");
export const HardDrive = icon("HardDrive");
export const History = icon("History");
export const Home = icon("Home");
export const Image = icon("Image");
export const Info = icon("Info");
export const Key = icon("Key");
export const LayoutGrid = icon("LayoutGrid");
export const LayoutTemplate = icon("LayoutTemplate");
export const Layers = icon("Layers");
export const List = icon("List");
export const Loader = icon("Loader");
export const Loader2 = icon("Loader2");
export const Monitor = icon("Monitor");
export const RefreshCw = icon("RefreshCw");
export const MoveRight = icon("MoveRight");
export const Music = icon("Music");
export const PanelRightClose = icon("PanelRightClose");
export const PanelRightOpen = icon("PanelRightOpen");
export const Pause = icon("Pause");
export const Pencil = icon("Pencil");
export const PencilLine = icon("PencilLine");
export const Pin = icon("Pin");
export const Play = icon("Play");
export const Plus = icon("Plus");
export const RotateCcw = icon("RotateCcw");
export const RotateCw = icon("RotateCw");
export const Scissors = icon("Scissors");
export const Save = icon("Save");
export const Search = icon("Search");
export const Send = icon("Send");
export const Settings = icon("Settings");
export const Sparkles = icon("Sparkles");
export const Star = icon("Star");
export const ToggleLeft = icon("ToggleLeft");
export const ToggleRight = icon("ToggleRight");
export const Trash2 = icon("Trash2");
export const Video = icon("Video");
export const Wand2 = icon("Wand2");
export const X = icon("X");
export const XCircle = icon("XCircle");
export const Zap = icon("Zap");
export const ZoomIn = icon("ZoomIn");
export const ZoomOut = icon("ZoomOut");
