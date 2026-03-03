import { invoke } from "@tauri-apps/api/core";
import { Loader } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useIconStore } from "../../stores/iconStore";
import { useThumbnailStore } from "../../stores/thumbnailStore";
import type { FileEntry } from "../../types";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);
const MAX_ITEMS = 9;
const THUMB_SIZE = 64;

/** フォルダホバー時に中身をタイルプレビューするポップアップ */
export interface FolderPeekProps {
  /** ホバー中のフォルダパス (null で非表示) */
  folderPath: string | null;
  /** ポップアップ表示の基準位置 */
  anchorRect: DOMRect | null;
  /** ポップアップを閉じるコールバック */
  onClose: () => void;
}

export const FolderPeek = memo(function FolderPeek({
  folderPath,
  anchorRect,
  onClose,
}: FolderPeekProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const popupRef = useRef<HTMLDivElement>(null);
  const fetchedPathRef = useRef<string | null>(null);

  // フォルダ中身を取得
  useEffect(() => {
    if (!folderPath) {
      setEntries([]);
      fetchedPathRef.current = null;
      return;
    }

    // 同じパスならスキップ
    if (fetchedPathRef.current === folderPath) return;

    let cancelled = false;
    setLoading(true);
    fetchedPathRef.current = folderPath;

    invoke<FileEntry[]>("list_directory", { path: folderPath })
      .then((result) => {
        if (cancelled) return;
        // 隠しファイルを除外し、先頭MAX_ITEMS件を取得
        const visible = result.filter((e) => !e.is_hidden).slice(0, MAX_ITEMS);
        setEntries(visible);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setEntries([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [folderPath]);

  // ポップアップ位置をビューポートに収まるように計算
  useEffect(() => {
    if (!anchorRect || !folderPath) return;

    // ポップアップ推定サイズ
    const popupWidth = 220;
    const popupHeight = 230;
    const margin = 8;

    let top = anchorRect.bottom + margin;
    let left = anchorRect.left;

    // 右端からはみ出す場合
    if (left + popupWidth > window.innerWidth - margin) {
      left = window.innerWidth - popupWidth - margin;
    }
    // 左端からはみ出す場合
    if (left < margin) {
      left = margin;
    }
    // 下端からはみ出す場合、上に表示
    if (top + popupHeight > window.innerHeight - margin) {
      top = anchorRect.top - popupHeight - margin;
    }
    // まだ上端からはみ出す場合
    if (top < margin) {
      top = margin;
    }

    setPosition({ top, left });
  }, [anchorRect, folderPath]);

  if (!folderPath || !anchorRect) return null;

  return (
    <div
      ref={popupRef}
      className="fixed z-50 bg-white border border-[#e0e0e0] rounded-lg shadow-lg p-2 pointer-events-none"
      style={{
        top: position.top,
        left: position.left,
        width: 220,
        minHeight: 60,
      }}
      onMouseEnter={onClose}
    >
      {loading ? (
        <div className="flex items-center justify-center h-16">
          <Loader className="w-5 h-5 text-[#aaa] animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex items-center justify-center h-16 text-xs text-[#999]">
          (空のフォルダ)
        </div>
      ) : (
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${Math.min(3, entries.length)}, 1fr)`,
          }}
        >
          {entries.map((entry) => (
            <PeekTile key={entry.path} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
});

/** タイル1つ分: 画像ならサムネイル、それ以外ならアイコン */
const PeekTile = memo(function PeekTile({ entry }: { entry: FileEntry }) {
  const isImage = !entry.is_dir && IMAGE_EXTS.has(entry.extension);
  const thumbKey = isImage ? `${entry.path}\0${THUMB_SIZE}` : "";

  const thumbnail = useThumbnailStore((s) => (isImage ? s.thumbnails[thumbKey] : undefined));
  const isPending = useThumbnailStore((s) => (isImage ? s.pending.has(thumbKey) : false));
  const fetchThumbnails = useThumbnailStore((s) => s.fetchThumbnails);

  // サムネイル取得
  const requestedRef = useRef(false);
  useEffect(() => {
    if (!isImage || thumbnail || isPending || requestedRef.current) return;
    requestedRef.current = true;
    fetchThumbnails([entry.path], THUMB_SIZE);
  }, [isImage, thumbnail, isPending, entry.path, fetchThumbnails]);

  const smallIcon = useIconStore((s) => s.icons[entry.is_dir ? "__directory__" : entry.extension]);

  const handleImageError = useCallback(() => {
    // 画像読み込み失敗時は何もしない（アイコンにフォールバックはしない）
  }, []);

  return (
    <div
      className="flex flex-col items-center justify-center rounded p-0.5 overflow-hidden"
      style={{ width: 64, height: 64 }}
      title={entry.name}
    >
      {isImage && thumbnail ? (
        <img
          src={thumbnail}
          alt=""
          className="rounded-sm object-cover"
          style={{ maxWidth: 56, maxHeight: 48 }}
          draggable={false}
          onError={handleImageError}
        />
      ) : isImage && isPending ? (
        <Loader className="w-4 h-4 text-[#ccc] animate-spin" />
      ) : smallIcon ? (
        <img src={smallIcon} alt="" className="w-6 h-6" draggable={false} />
      ) : (
        <div className="w-6 h-6 bg-[#eee] rounded" />
      )}
      <span className="w-full text-center truncate text-[10px] text-[#666] mt-0.5 leading-tight">
        {entry.name}
      </span>
    </div>
  );
});
