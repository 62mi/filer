import { useEffect, useState } from "react";

const PREVIEW_FONT_FAMILY = "__filer_preview_font__";
const SAMPLE_EN = "The quick brown fox jumps over the lazy dog";
const SAMPLE_JP = "あいうえお 漢字 カタカナ ABCabc 0123456789";

interface FontPreviewProps {
  url: string;
  name: string;
  compact?: boolean;
}

export function FontPreview({ url, name, compact }: FontPreviewProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fontFace = new FontFace(PREVIEW_FONT_FAMILY, `url(${url})`);

    fontFace
      .load()
      .then((f) => {
        if (cancelled) return;
        document.fonts.add(f);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      document.fonts.delete(fontFace);
      setLoaded(false);
      setError(false);
    };
  }, [url]);

  if (error) {
    return <div className="text-xs text-[#999] text-center">Unable to load font</div>;
  }

  if (!loaded) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="w-5 h-5 border-2 border-[#0078d4] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-[#999]">Loading font...</span>
      </div>
    );
  }

  const sizes = compact ? [14, 22, 32] : [14, 22, 32, 48];

  return (
    <div className="w-full space-y-4">
      <div className="text-xs font-medium text-[#1a1a1a]">{name}</div>
      {sizes.map((size) => (
        <div key={size}>
          <div className="text-[10px] text-[#999] mb-1">{size}px</div>
          <div
            style={{ fontFamily: PREVIEW_FONT_FAMILY, fontSize: `${size}px`, lineHeight: 1.4 }}
            className="text-[#333] break-all"
          >
            {SAMPLE_EN}
          </div>
          <div
            style={{ fontFamily: PREVIEW_FONT_FAMILY, fontSize: `${size}px`, lineHeight: 1.4 }}
            className="text-[#333] break-all mt-1"
          >
            {SAMPLE_JP}
          </div>
        </div>
      ))}
    </div>
  );
}
