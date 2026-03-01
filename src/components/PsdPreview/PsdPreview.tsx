import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

interface PsdPreviewProps {
  url: string;
  /** ファイルの実パス（FFmpegフォールバック用） */
  filePath?: string;
  name: string;
  maxHeight?: string;
}

export function PsdPreview({ url, filePath, name, maxHeight = "70vh" }: PsdPreviewProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      // 1) @webtoon/psdでパース（RGB/Grayscale対応）
      try {
        const PsdParser = (await import("@webtoon/psd")).default;
        const { ColorMode } = await import("@webtoon/psd");
        const res = await fetch(url);
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        const psd = PsdParser.parse(buffer);

        // CMYK等の非RGB/Grayscaleは即FFmpegフォールバック
        if (psd.colorMode !== ColorMode.Rgb && psd.colorMode !== ColorMode.Grayscale) {
          throw new Error("Unsupported color mode, fallback to FFmpeg");
        }

        const compositeData = await psd.composite();
        if (cancelled) return;

        const imageData = new ImageData(compositeData, psd.width, psd.height);
        const canvas = document.createElement("canvas");
        canvas.width = psd.width;
        canvas.height = psd.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas context not available");
        ctx.putImageData(imageData, 0, 0);

        await new Promise<void>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (cancelled || !blob) {
              reject(new Error("toBlob failed"));
              return;
            }
            objectUrl = URL.createObjectURL(blob);
            setImageUrl(objectUrl);
            setLoading(false);
            resolve();
          });
        });
        return;
      } catch {
        // @webtoon/psd失敗 → FFmpegフォールバック
      }

      // 2) FFmpegフォールバック（CMYK等）
      if (cancelled) return;
      if (filePath) {
        try {
          const dataUri = await invoke<string>("extract_video_thumbnail", {
            path: filePath,
            size: 1024,
          });
          if (cancelled) return;
          setImageUrl(dataUri);
          setLoading(false);
          return;
        } catch {
          // FFmpegも失敗
        }
      }

      if (!cancelled) {
        setError("CMYK PSD — FFmpeg required for preview");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, filePath]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 border-2 border-[#0078d4] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-[#999]">Parsing PSD...</span>
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      <div className="text-center">
        <div className="text-xs text-[#999]">Unable to load PSD</div>
        {error && (
          <div className="text-[10px] text-[#bbb] mt-1 max-w-xs mx-auto break-all">{error}</div>
        )}
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={name}
      className="max-w-full object-contain rounded-md"
      style={{ maxHeight, imageRendering: "auto" }}
    />
  );
}
