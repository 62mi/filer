export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "";
  const units = ["バイト", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / 1024 ** i;
  if (i === 0) return `${bytes} ${units[0]}`;
  // Explorer風: KB以上は切り上げで整数表示
  return `${Math.ceil(size).toLocaleString()} ${units[i]}`;
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
