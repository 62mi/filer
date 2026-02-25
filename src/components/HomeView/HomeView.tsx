import { invoke } from "@tauri-apps/api/core";
import {
  ChevronDown,
  Download,
  FileText,
  Folder,
  HardDrive,
  Image,
  Monitor,
  Music,
  Pin,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "../../i18n";
import { useBookmarkStore } from "../../stores/bookmarkStore";
import { useIconStore } from "../../stores/iconStore";
import { useExplorerStore } from "../../stores/panelStore";
import type { DriveInfo, RecentFile } from "../../types";
import { cn } from "../../utils/cn";
import { formatDate, formatFileSize } from "../../utils/format";

type BottomTab = "recent" | "favorites";

function SidebarIcon({ ext, fallback }: { ext: string; fallback: React.ReactNode }) {
  const iconUrl = useIconStore((s) => s.icons[ext]);
  if (iconUrl) {
    return <img src={iconUrl} alt="" className="w-4 h-4 shrink-0" draggable={false} />;
  }
  return <>{fallback}</>;
}

export function HomeView() {
  const t = useTranslation();
  const loadDirectory = useExplorerStore((s) => s.loadDirectory);
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const fetchIcons = useIconStore((s) => s.fetchIcons);

  const KNOWN_FOLDERS: { key: string; label: string; icon: React.ReactNode }[] = useMemo(
    () => [
      { key: "Desktop", label: t.homeView.desktop, icon: <Monitor className="w-6 h-6" /> },
      { key: "Downloads", label: t.homeView.downloads, icon: <Download className="w-6 h-6" /> },
      { key: "Documents", label: t.homeView.documents, icon: <FileText className="w-6 h-6" /> },
      { key: "Pictures", label: t.homeView.pictures, icon: <Image className="w-6 h-6" /> },
      { key: "Music", label: t.homeView.music, icon: <Music className="w-6 h-6" /> },
      { key: "Videos", label: t.homeView.videos, icon: <Video className="w-6 h-6" /> },
    ],
    [t],
  );

  const [homeDir, setHomeDir] = useState("");
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [bottomTab, setBottomTab] = useState<BottomTab>("recent");
  const [quickAccessOpen, setQuickAccessOpen] = useState(true);

  useEffect(() => {
    invoke<string>("get_home_dir").then(setHomeDir);
    invoke<DriveInfo[]>("get_drives").then(setDrives);
    invoke<RecentFile[]>("get_recent_files", { limit: 50 }).then(setRecentFiles);
    fetchIcons(["__directory__"]);
  }, [fetchIcons]);

  // 最近のファイルのアイコンを取得
  useEffect(() => {
    if (recentFiles.length === 0) return;
    const exts = new Set<string>();
    for (const f of recentFiles) {
      if (f.extension) exts.add(f.extension);
    }
    if (exts.size > 0) fetchIcons(Array.from(exts));
  }, [recentFiles, fetchIcons]);

  const bookmarkPaths = new Set(bookmarks.map((b) => b.path.toLowerCase()));

  // クイックアクセスカード一覧
  const quickAccessItems: {
    label: string;
    path: string;
    icon: React.ReactNode;
    pinned: boolean;
  }[] = [];

  // 既知フォルダ
  if (homeDir) {
    for (const folder of KNOWN_FOLDERS) {
      const path = `${homeDir}\\${folder.key}`;
      quickAccessItems.push({
        label: folder.label,
        path,
        icon: folder.icon,
        pinned: bookmarkPaths.has(path.toLowerCase()),
      });
    }
  }

  // ドライブ
  for (const drive of drives) {
    quickAccessItems.push({
      label: drive.display_name,
      path: drive.path,
      icon: drive.icon ? (
        <img src={drive.icon} alt="" className="w-6 h-6" draggable={false} />
      ) : (
        <HardDrive className="w-6 h-6" />
      ),
      pinned: false,
    });
  }

  // ブックマーク（既知フォルダ/ドライブと重複しないもの）
  const existingPaths = new Set(quickAccessItems.map((i) => i.path.toLowerCase()));
  for (const bm of bookmarks) {
    if (existingPaths.has(bm.path.toLowerCase())) continue;
    quickAccessItems.push({
      label: bm.name,
      path: bm.path,
      icon: <Folder className="w-6 h-6 text-[#e8a520] fill-[#f2c55c]" />,
      pinned: true,
    });
  }

  const handleNavigateRecent = (file: RecentFile) => {
    if (file.is_dir) {
      loadDirectory(file.path);
    } else {
      invoke("open_in_default_app", { path: file.path });
    }
  };

  const handleNavigateToLocation = (e: React.MouseEvent, location: string) => {
    e.stopPropagation();
    loadDirectory(location);
  };

  // 「お気に入り」タブのデータ
  const favoriteItems = bookmarks.filter((b) => !b.folderId);

  return (
    <div className="flex flex-col h-full overflow-y-auto px-6 py-4">
      {/* クイックアクセス */}
      <button
        className="flex items-center gap-1.5 mb-3 text-sm font-semibold text-[#1a1a1a] hover:text-[#0078d4] transition-colors"
        onClick={() => setQuickAccessOpen(!quickAccessOpen)}
      >
        <ChevronDown
          className={cn(
            "w-4 h-4 transition-transform duration-200",
            !quickAccessOpen && "-rotate-90",
          )}
        />
        {t.homeView.quickAccess}
      </button>

      {quickAccessOpen && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-1.5 mb-6">
          {quickAccessItems.map((item) => (
            <button
              key={item.path}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#e8e8e8] transition-colors text-left group"
              onClick={() => loadDirectory(item.path)}
              title={item.path}
            >
              <span className="shrink-0 text-[#666]">{item.icon}</span>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm text-[#1a1a1a] truncate">{item.label}</span>
                <span className="text-[11px] text-[#999] truncate">{item.path}</span>
              </div>
              {item.pinned && (
                <Pin className="w-3 h-3 text-[#999] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* 下部タブ */}
      <div className="flex items-center gap-1 mb-2">
        <button
          className={cn(
            "px-3 py-1 text-sm rounded-full transition-colors",
            bottomTab === "recent"
              ? "bg-[#e8e8e8] text-[#1a1a1a] font-medium"
              : "text-[#666] hover:bg-[#f0f0f0]",
          )}
          onClick={() => setBottomTab("recent")}
        >
          {t.homeView.recentItems}
        </button>
        <button
          className={cn(
            "px-3 py-1 text-sm rounded-full transition-colors",
            bottomTab === "favorites"
              ? "bg-[#e8e8e8] text-[#1a1a1a] font-medium"
              : "text-[#666] hover:bg-[#f0f0f0]",
          )}
          onClick={() => setBottomTab("favorites")}
        >
          {t.homeView.favorites}
        </button>
      </div>

      {/* テーブル */}
      <div className="flex-1 min-h-0">
        {/* ヘッダ行 */}
        <div className="flex items-center h-7 px-2 text-[11px] text-[#999] border-b border-[#e5e5e5] select-none">
          <span className="w-[40%] shrink-0">{t.common.name}</span>
          {bottomTab === "recent" ? (
            <>
              <span className="w-[20%] shrink-0">{t.homeView.accessedDate}</span>
              <span className="w-[25%] shrink-0">{t.homeView.fileLocation}</span>
              <span className="w-[15%] shrink-0 text-right pr-2">{t.common.size}</span>
            </>
          ) : (
            <span className="w-[60%] shrink-0">{t.homeView.path}</span>
          )}
        </div>

        {/* リスト */}
        <div className="overflow-y-auto">
          {bottomTab === "recent" &&
            recentFiles.map((file) => (
              <div
                key={file.path}
                className="flex items-center h-7 px-2 text-sm hover:bg-[#e8e8e8] rounded cursor-pointer transition-colors"
                onDoubleClick={() => handleNavigateRecent(file)}
              >
                <div className="flex items-center gap-2 w-[40%] shrink-0 min-w-0">
                  <SidebarIcon
                    ext={file.is_dir ? "__directory__" : file.extension}
                    fallback={
                      file.is_dir ? (
                        <Folder className="w-4 h-4 text-[#e8a520] fill-[#f2c55c]" />
                      ) : (
                        <FileText className="w-4 h-4 text-[#666]" />
                      )
                    }
                  />
                  <span className="truncate">{file.name}</span>
                </div>
                <span className="w-[20%] shrink-0 text-[#666] text-[12px] tabular-nums">
                  {formatDate(file.accessed)}
                </span>
                <button
                  className="w-[25%] shrink-0 text-[#666] text-[12px] truncate text-left hover:text-[#0078d4] hover:underline"
                  onClick={(e) => handleNavigateToLocation(e, file.location)}
                  title={file.location}
                >
                  {file.location.split("\\").pop() || file.location}
                </button>
                <span className="w-[15%] shrink-0 text-[#666] text-[12px] text-right pr-2 tabular-nums">
                  {file.is_dir ? "" : formatFileSize(file.size)}
                </span>
              </div>
            ))}
          {bottomTab === "recent" && recentFiles.length === 0 && (
            <div className="flex items-center justify-center h-20 text-sm text-[#999]">
              {t.homeView.noRecentItems}
            </div>
          )}

          {bottomTab === "favorites" &&
            favoriteItems.map((bm) => (
              <div
                key={bm.id}
                className="flex items-center h-7 px-2 text-sm hover:bg-[#e8e8e8] rounded cursor-pointer transition-colors"
                onDoubleClick={() => loadDirectory(bm.path)}
              >
                <div className="flex items-center gap-2 w-[40%] shrink-0 min-w-0">
                  <SidebarIcon
                    ext="__directory__"
                    fallback={<Folder className="w-4 h-4 text-[#e8a520] fill-[#f2c55c]" />}
                  />
                  <span className="truncate">{bm.name}</span>
                </div>
                <span className="w-[60%] shrink-0 text-[#666] text-[12px] truncate">{bm.path}</span>
              </div>
            ))}
          {bottomTab === "favorites" && favoriteItems.length === 0 && (
            <div className="flex items-center justify-center h-20 text-sm text-[#999]">
              {t.homeView.noFavorites}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
