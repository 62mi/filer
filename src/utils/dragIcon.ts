/**
 * 外部ドラッグ用のアイコンPNGを生成し、一時ファイルに保存する。
 * 内部ゴーストと同じ見た目（サムネイルプレビュー or アイコンカード + スタック + バッジ）を
 * Canvas で描画し、Rust経由でtempに書き出す。
 */
import { invoke } from "@tauri-apps/api/core";

const ICON_SIZE = 48;
const THUMB_MAX = 120;
const CARD_PAD = 4;
const STACK_GAP = 4;
const RADIUS = 6;

function rrect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, r);
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  shadow: boolean,
) {
  if (shadow) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.12)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
  }
  rrect(ctx, x, y, w, h, RADIUS);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  if (shadow) ctx.restore();
  rrect(ctx, x, y, w, h, RADIUS);
  ctx.strokeStyle = "#d0d0d0";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  count: number,
  color: string,
) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.15)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 10px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(count), cx, cy + 0.5);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 内部ゴーストと同じ見た目のドラッグアイコンPNGを生成し、一時ファイルパスを返す */
export async function generateDragIcon(options: {
  previewSrc?: string | null;
  iconSrc?: string | null;
  count: number;
}): Promise<string | null> {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const accent =
      getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#0078d4";
    const { count } = options;
    const stackTotal = count > 2 ? STACK_GAP * 2 : count > 1 ? STACK_GAP : 0;
    const margin = 8; // 影用の余白

    if (options.previewSrc) {
      // サムネイルプレビューモード
      const img = await loadImage(options.previewSrc);
      if (!img) return null;

      const scale = Math.min(THUMB_MAX / img.width, THUMB_MAX / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const cardW = w + CARD_PAD * 2;
      const cardH = h + CARD_PAD * 2;

      canvas.width = cardW + stackTotal + margin;
      canvas.height = cardH + stackTotal + margin;

      if (count > 2) drawCard(ctx, stackTotal, stackTotal, cardW, cardH, false);
      if (count > 1) drawCard(ctx, stackTotal / 2, stackTotal / 2, cardW, cardH, false);
      drawCard(ctx, 0, 0, cardW, cardH, true);

      // 画像（角丸クリップ）
      ctx.save();
      rrect(ctx, CARD_PAD, CARD_PAD, w, h, 2);
      ctx.clip();
      ctx.drawImage(img, CARD_PAD, CARD_PAD, w, h);
      ctx.restore();

      if (count > 1) drawBadge(ctx, cardW + stackTotal - 2, 9, count, accent);
    } else {
      // アイコンモード
      canvas.width = ICON_SIZE + stackTotal + margin;
      canvas.height = ICON_SIZE + stackTotal + margin;

      if (count > 2) drawCard(ctx, stackTotal, stackTotal, ICON_SIZE, ICON_SIZE, false);
      if (count > 1) drawCard(ctx, stackTotal / 2, stackTotal / 2, ICON_SIZE, ICON_SIZE, false);
      drawCard(ctx, 0, 0, ICON_SIZE, ICON_SIZE, true);

      if (options.iconSrc) {
        const iconImg = await loadImage(options.iconSrc);
        if (iconImg) {
          const px = 32;
          const off = (ICON_SIZE - px) / 2;
          ctx.drawImage(iconImg, off, off, px, px);
        }
      }

      if (count > 1) drawBadge(ctx, ICON_SIZE + stackTotal - 2, 9, count, accent);
    }

    // Canvas → PNG → 一時ファイル
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) return null;

    const buffer = await blob.arrayBuffer();
    const data = Array.from(new Uint8Array(buffer));
    return invoke<string>("save_temp_drag_icon", { data });
  } catch {
    return null;
  }
}
