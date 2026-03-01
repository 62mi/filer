import { invoke } from "@tauri-apps/api/core";
import {
  FlipHorizontal,
  FlipVertical,
  RotateCcw,
  RotateCw,
  Save,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "../i18n";
import { toast } from "../stores/toastStore";

const SAVEABLE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "jpe", "jfif", "gif", "webp"]);

interface ImageToolbarProps {
  extension: string;
  filePath: string;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  isModified: boolean;
  isTransformed: boolean;
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRotateCcw: () => void;
  onRotateCw: () => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onReset: () => void;
  onSaved: () => void;
}

export function ImageToolbar({
  extension,
  filePath,
  rotation,
  flipH,
  flipV,
  isModified,
  isTransformed,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onRotateCcw,
  onRotateCw,
  onFlipH,
  onFlipV,
  onReset,
  onSaved,
}: ImageToolbarProps) {
  const t = useTranslation();
  const [saving, setSaving] = useState(false);
  const formatSaveable = SAVEABLE_EXTENSIONS.has(extension.toLowerCase());
  const canSave = formatSaveable && isModified;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await invoke("transform_image", {
        path: filePath,
        rotation,
        flipH,
        flipV,
      });
      toast.success(t.imageControls.saved);
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="flex items-center gap-0.5 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-lg shadow-lg"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* 回転 */}
      <ToolButton onClick={onRotateCcw} title={t.imageControls.rotateCcw}>
        <RotateCcw className="w-3.5 h-3.5" />
      </ToolButton>
      <ToolButton onClick={onRotateCw} title={t.imageControls.rotateCw}>
        <RotateCw className="w-3.5 h-3.5" />
      </ToolButton>

      <Separator />

      {/* 反転 */}
      <ToolButton onClick={onFlipH} title={t.imageControls.flipH} active={flipH}>
        <FlipHorizontal className="w-3.5 h-3.5" />
      </ToolButton>
      <ToolButton onClick={onFlipV} title={t.imageControls.flipV} active={flipV}>
        <FlipVertical className="w-3.5 h-3.5" />
      </ToolButton>

      <Separator />

      {/* ズーム */}
      <ToolButton onClick={onZoomOut} title={t.imageControls.zoomOut}>
        <ZoomOut className="w-3.5 h-3.5" />
      </ToolButton>
      <span className="text-[10px] text-white/80 min-w-[3.5ch] text-center tabular-nums select-none">
        {zoomPercent}%
      </span>
      <ToolButton onClick={onZoomIn} title={t.imageControls.zoomIn}>
        <ZoomIn className="w-3.5 h-3.5" />
      </ToolButton>

      {/* リセット（変形時のみ表示） */}
      {isTransformed && (
        <>
          <Separator />
          <ToolButton onClick={onReset} title={t.imageControls.reset}>
            <RotateCcw className="w-3.5 h-3.5" />
          </ToolButton>
        </>
      )}

      {/* 保存（常時表示、保存可能時にアクセントカラー） */}
      {formatSaveable && (
        <>
          <Separator />
          <button
            className={`p-1.5 rounded transition-all ${
              canSave
                ? "text-white bg-[var(--accent)] hover:brightness-110 shadow-[0_0_8px_rgba(var(--accent-rgb),0.4)]"
                : "text-white/30 cursor-default"
            } ${saving ? "opacity-50 cursor-not-allowed" : ""}`}
            onClick={handleSave}
            title={t.imageControls.saveToFile}
            disabled={!canSave || saving}
          >
            <Save className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

function ToolButton({
  children,
  onClick,
  title,
  active,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={`p-1.5 rounded transition-colors ${
        active ? "bg-white/25 text-white" : "text-white/70 hover:bg-white/15 hover:text-white"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <div className="w-px h-4 bg-white/20 mx-0.5" />;
}
