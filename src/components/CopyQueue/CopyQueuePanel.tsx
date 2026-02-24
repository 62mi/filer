import { Check, Pause, Play, Trash2, X, XCircle } from "lucide-react";
import { useCopyQueueStore } from "../../stores/copyQueueStore";
import { formatFileSize } from "../../utils/format";

export function CopyQueuePanel() {
  const isOpen = useCopyQueueStore((s) => s.isPanelOpen);
  const items = useCopyQueueStore((s) => s.items);
  const { closePanel, pause, resume, cancel, clearCompleted } = useCopyQueueStore.getState();

  if (!isOpen || items.length === 0) return null;

  const hasCompleted = items.some(
    (i) => i.status === "completed" || i.status === "cancelled" || i.status === "error",
  );

  return (
    <div className="fixed bottom-10 right-4 z-[55] w-[360px] bg-white rounded-xl shadow-2xl border border-[#d0d0d0] overflow-hidden animate-fade-scale-in">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#f9f9f9] border-b border-[#e5e5e5]">
        <span className="text-sm font-medium">コピーキュー ({items.length})</span>
        <div className="flex items-center gap-1">
          {hasCompleted && (
            <button
              className="p-1 rounded hover:bg-[#e8e8e8] text-[#999]"
              onClick={clearCompleted}
              title="完了済みをクリア"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button className="p-1 rounded hover:bg-[#e8e8e8] text-[#999]" onClick={closePanel}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* キューアイテム */}
      <div className="max-h-[300px] overflow-y-auto">
        {items.map((item) => (
          <QueueItem
            key={item.id}
            item={item}
            onPause={() => pause(item.id)}
            onResume={() => resume(item.id)}
            onCancel={() => cancel(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

function QueueItem({
  item,
  onPause,
  onResume,
  onCancel,
}: {
  item: {
    id: string;
    operation: string;
    total_bytes: number;
    copied_bytes: number;
    file_count: number;
    files_done: number;
    status: string;
    error: string | null;
    current_file: string | null;
    dest: string;
  };
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  const progress =
    item.total_bytes > 0 ? Math.round((item.copied_bytes / item.total_bytes) * 100) : 0;
  const isActive =
    item.status === "running" || item.status === "paused" || item.status === "calculating";
  const destName = item.dest?.split("\\").pop() || item.dest || "";

  const statusLabel =
    {
      calculating: "計算中...",
      pending: "待機中",
      running: `${progress}%`,
      paused: "一時停止",
      completed: "完了",
      cancelled: "キャンセル",
      error: "エラー",
    }[item.status] || item.status;

  const statusColor =
    {
      calculating: "text-[#0078d4]",
      pending: "text-[#999]",
      running: "text-[#0078d4]",
      paused: "text-amber-500",
      completed: "text-green-600",
      cancelled: "text-[#999]",
      error: "text-red-500",
    }[item.status] || "text-[#999]";

  return (
    <div className="px-4 py-2 border-b border-[#f0f0f0] last:border-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium uppercase text-[#999]">
          {item.operation === "move" ? "Move" : "Copy"}
        </span>
        <span className="text-xs text-[#666] truncate flex-1" title={item.dest}>
          → {destName}
        </span>
        <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
      </div>

      {/* プログレスバー */}
      {isActive && (
        <div className="h-2 bg-[#e5e5e5] rounded-full overflow-hidden mb-1">
          {item.status === "calculating" ? (
            <div className="h-full w-1/3 bg-[#0078d4] rounded-full animate-pulse" />
          ) : (
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                item.status === "paused" ? "bg-amber-400" : "bg-[#0078d4]"
              }`}
              style={{ width: `${progress}%` }}
            />
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-[#999] truncate" title={item.current_file || undefined}>
          {isActive && item.current_file
            ? item.current_file.split("\\").pop()
            : `${item.files_done}/${item.file_count} files`}
          {isActive &&
            ` · ${formatFileSize(item.copied_bytes)}/${formatFileSize(item.total_bytes)}`}
        </span>

        {isActive && (
          <div className="flex items-center gap-0.5 shrink-0 ml-2">
            {item.status === "paused" ? (
              <button
                className="p-0.5 rounded hover:bg-[#e8e8e8] text-[#0078d4]"
                onClick={onResume}
                title="再開"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                className="p-0.5 rounded hover:bg-[#e8e8e8] text-amber-500"
                onClick={onPause}
                title="一時停止"
              >
                <Pause className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              className="p-0.5 rounded hover:bg-red-50 text-[#999] hover:text-red-500"
              onClick={onCancel}
              title="キャンセル"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {item.status === "completed" && <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />}

        {item.status === "error" && (
          <span className="text-xs text-red-500 truncate ml-2" title={item.error || undefined}>
            {item.error}
          </span>
        )}
      </div>
    </div>
  );
}

/** StatusBarに表示するミニインジケータ */
export function CopyQueueMiniIndicator() {
  const items = useCopyQueueStore((s) => s.items);
  const togglePanel = useCopyQueueStore((s) => s.togglePanel);

  const activeItems = items.filter(
    (i) => i.status === "running" || i.status === "paused" || i.status === "calculating",
  );
  if (activeItems.length === 0) return null;

  const totalBytes = activeItems.reduce((sum, i) => sum + i.total_bytes, 0);
  const copiedBytes = activeItems.reduce((sum, i) => sum + i.copied_bytes, 0);
  const progress = totalBytes > 0 ? Math.round((copiedBytes / totalBytes) * 100) : 0;

  return (
    <button
      className="flex items-center gap-1.5 px-2 py-0.5 mr-2 rounded hover:bg-[#e0e0e0] transition-colors text-[#0078d4]"
      onClick={togglePanel}
      title={`${activeItems.length} 件のコピー進行中 (${progress}%)`}
    >
      <div className="w-12 h-1.5 bg-[#e5e5e5] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#0078d4] rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-xs tabular-nums">{progress}%</span>
      {activeItems.some((i) => i.status === "paused") && (
        <Pause className="w-3 h-3 text-amber-500" />
      )}
    </button>
  );
}
