import { getTranslation } from "../i18n";

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "";
  const byteLabel = getTranslation().format.bytes;
  const units = [byteLabel, "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / 1024 ** i;
  if (i === 0) return `${bytes} ${units[0]}`;
  // Explorer風: KB以上は切り上げで整数表示
  return `${Math.ceil(size).toLocaleString()} ${units[i]}`;
}

export function getSizeBarColor(bytes: number): string {
  const MB = 1024 * 1024;
  const GB = MB * 1024;
  if (bytes < 1 * MB) return "#60a5fa"; // 青 (< 1MB)
  if (bytes < 100 * MB) return "#34d399"; // 緑 (1MB-100MB)
  if (bytes < 1 * GB) return "#fb923c"; // オレンジ (100MB-1GB)
  return "#f87171"; // 赤 (> 1GB)
}

export function formatDate(timestamp: number): string {
  if (timestamp === 0) return "";
  const date = new Date(timestamp * 1000);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${d} ${h}:${min}`;
}
