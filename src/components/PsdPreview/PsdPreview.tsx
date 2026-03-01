import { useEffect, useState } from "react";

interface PsdPreviewProps {
  url: string;
  name: string;
  maxHeight?: string;
}

export function PsdPreview({ url, name, maxHeight = "70vh" }: PsdPreviewProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const { readPsd } = await import("ag-psd");
        const res = await fetch(url);
        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        const psd = readPsd(new Uint8Array(buffer));
        if (!psd.canvas || cancelled) {
          setError(true);
          setLoading(false);
          return;
        }

        psd.canvas.toBlob((blob) => {
          if (cancelled || !blob) {
            if (!cancelled) {
              setError(true);
              setLoading(false);
            }
            return;
          }
          objectUrl = URL.createObjectURL(blob);
          setImageUrl(objectUrl);
          setLoading(false);
        });
      } catch {
        if (!cancelled) {
          setError(true);
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
    return <div className="text-xs text-[#999] text-center">Unable to load PSD</div>;
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
