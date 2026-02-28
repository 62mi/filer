import * as pdfjsLib from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

// pdf.worker をVite経由でインポート
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const MAX_PAGES = 3;

interface PdfViewerProps {
  url: string;
  maxHeight?: number;
}

export function PdfViewer({ url, maxHeight }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageInfo, setPageInfo] = useState("");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    async function render() {
      try {
        const pdf = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;

        const totalPages = pdf.numPages;
        const pagesToRender = Math.min(totalPages, MAX_PAGES);
        setPageInfo(
          totalPages > MAX_PAGES
            ? `1-${pagesToRender} / ${totalPages} pages`
            : `${totalPages} page${totalPages > 1 ? "s" : ""}`,
        );

        // 既存canvasをクリア
        if (container) container.innerHTML = "";

        for (let i = 1; i <= pagesToRender; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);

          // コンテナ幅に合わせてスケール計算
          const containerWidth = container?.clientWidth ?? 400;
          const viewport = page.getViewport({ scale: 1 });
          const scale = containerWidth / viewport.width;
          const scaledViewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = scaledViewport.width;
          canvas.height = scaledViewport.height;
          canvas.style.display = "block";
          canvas.style.marginBottom = "4px";
          canvas.style.borderRadius = "4px";
          canvas.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";

          const ctx = canvas.getContext("2d");
          if (!ctx) continue;

          container?.appendChild(canvas);

          await page.render({
            canvasContext: ctx,
            canvas,
            viewport: scaledViewport,
          }).promise;
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "PDF読み込みエラー");
        }
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-[#999]">{error}</div>
    );
  }

  return (
    <div
      className="flex flex-col items-center w-full"
      style={{ maxHeight: maxHeight ? `${maxHeight}px` : undefined }}
    >
      <div ref={containerRef} className="w-full overflow-auto" />
      {pageInfo && <div className="text-[10px] text-[#999] mt-1">{pageInfo}</div>}
    </div>
  );
}
