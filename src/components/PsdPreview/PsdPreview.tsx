import { useEffect, useState } from "react";

interface PsdPreviewProps {
  url: string;
  name: string;
  maxHeight?: string;
}

export function PsdPreview({ url, name, maxHeight = "70vh" }: PsdPreviewProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const { readPsd } = await import("ag-psd");
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`fetch failed: ${res.status}`);
        }
        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        const psd = readPsd(new Uint8Array(buffer), {
          skipLayerImageData: true,
        });

        if (!psd.canvas) {
          // canvasが生成されなかった場合の詳細情報
          const info = [
            `colorMode: ${psd.colorMode}`,
            `size: ${psd.width}x${psd.height}`,
            `bitsPerChannel: ${psd.bitsPerChannel}`,
            `channels: ${psd.channels}`,
          ].join(", ");
          throw new Error(`No composite image (${info})`);
        }
        if (cancelled) return;

        psd.canvas.toBlob((blob) => {
          if (cancelled || !blob) {
            if (!cancelled) {
              setError("Failed to convert canvas to blob");
              setLoading(false);
            }
            return;
          }
          objectUrl = URL.createObjectURL(blob);
          setImageUrl(objectUrl);
          setLoading(false);
        });
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

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
