import { Check, Copy, Loader2, Search, Trash2, X } from "lucide-react";
import { useTranslation } from "../../i18n";
import {
  type DuplicateGroup,
  useDuplicateDetectorStore,
} from "../../stores/duplicateDetectorStore";
import { useExplorerStore } from "../../stores/panelStore";
import { formatDate, formatFileSize } from "../../utils/format";

function DuplicateGroupCard({ group }: { group: DuplicateGroup }) {
  const t = useTranslation();
  const selectedForDeletion = useDuplicateDetectorStore((s) => s.selectedForDeletion);
  const toggleFileForDeletion = useDuplicateDetectorStore((s) => s.toggleFileForDeletion);

  const selectedPaths = selectedForDeletion[group.hash] ?? new Set<string>();

  return (
    <div className="border border-[var(--chrome-border)] rounded-lg overflow-hidden">
      {/* グループヘッダー */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--chrome-bg)] text-sm">
        <Copy className="w-4 h-4 text-[var(--chrome-text-dim)]" />
        <span className="font-medium">
          {group.files.length} {t.duplicateDetector.filesInGroup}
        </span>
        <span className="text-[var(--chrome-text-dim)]">
          ({formatFileSize(group.size)} {t.duplicateDetector.each})
        </span>
      </div>

      {/* ファイルリスト */}
      <div className="divide-y divide-[var(--chrome-border)]">
        {group.files.map((file, idx) => {
          const isSelected = selectedPaths.has(file.path);
          return (
            <div
              key={file.path}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-[var(--chrome-hover)] transition-colors ${
                isSelected ? "bg-red-50" : ""
              }`}
              onClick={() => toggleFileForDeletion(group.hash, file.path)}
            >
              {/* チェックボックス */}
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                  isSelected
                    ? "bg-red-500 border-red-500 text-white"
                    : "border-[var(--chrome-border)]"
                }`}
              >
                {isSelected && <Check className="w-3 h-3" />}
              </div>

              {/* ファイル情報 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`truncate ${isSelected ? "line-through text-red-500" : ""}`}>
                    {file.name}
                  </span>
                  {idx === 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 shrink-0">
                      {t.duplicateDetector.original}
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--chrome-text-dim)] truncate">{file.path}</div>
              </div>

              {/* 更新日時 */}
              <span className="text-xs text-[var(--chrome-text-dim)] shrink-0">
                {formatDate(file.modified)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DuplicateDetector() {
  const t = useTranslation();
  const isOpen = useDuplicateDetectorStore((s) => s.isOpen);
  const loading = useDuplicateDetectorStore((s) => s.loading);
  const groups = useDuplicateDetectorStore((s) => s.groups);
  const totalWastedBytes = useDuplicateDetectorStore((s) => s.totalWastedBytes);
  const scannedFiles = useDuplicateDetectorStore((s) => s.scannedFiles);
  const selectedForDeletion = useDuplicateDetectorStore((s) => s.selectedForDeletion);
  const deleting = useDuplicateDetectorStore((s) => s.deleting);
  const targetPath = useDuplicateDetectorStore((s) => s.targetPath);
  const close = useDuplicateDetectorStore((s) => s.close);
  const scan = useDuplicateDetectorStore((s) => s.scan);
  const selectAllDuplicates = useDuplicateDetectorStore((s) => s.selectAllDuplicates);
  const deselectAll = useDuplicateDetectorStore((s) => s.deselectAll);
  const deleteSelected = useDuplicateDetectorStore((s) => s.deleteSelected);
  const refreshDirectory = useExplorerStore((s) => s.refreshDirectory);

  if (!isOpen) return null;

  // 削除対象の総数を計算
  let totalSelectedCount = 0;
  for (const pathSet of Object.values(selectedForDeletion)) {
    totalSelectedCount += pathSet.size;
  }

  const handleDelete = async () => {
    await deleteSelected();
    refreshDirectory();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[680px] max-h-[80vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--chrome-border)]">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Search className="w-4 h-4" />
            {t.duplicateDetector.title}
          </h2>
          <button
            className="p-1 rounded hover:bg-[var(--chrome-hover)] transition-colors"
            onClick={close}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
              <span className="text-sm text-[var(--chrome-text-dim)]">
                {t.duplicateDetector.scanning}
              </span>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Check className="w-8 h-8 text-green-500" />
              <span className="text-sm text-[var(--chrome-text-dim)]">
                {t.duplicateDetector.noDuplicates}
              </span>
              <span className="text-xs text-[var(--chrome-text-dim)]">
                {scannedFiles} {t.duplicateDetector.filesScanned}
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              {/* サマリー */}
              <div className="flex items-center justify-between text-sm">
                <span>
                  {groups.length} {t.duplicateDetector.groupsFound} / {scannedFiles}{" "}
                  {t.duplicateDetector.filesScanned}
                </span>
                <span className="text-amber-600 font-medium">
                  {formatFileSize(totalWastedBytes)} {t.duplicateDetector.reclaimable}
                </span>
              </div>

              {/* 一括操作 */}
              <div className="flex items-center gap-2">
                <button
                  className="text-xs px-2 py-1 rounded border border-[var(--chrome-border)] hover:bg-[var(--chrome-hover)] transition-colors"
                  onClick={selectAllDuplicates}
                >
                  {t.duplicateDetector.selectAllDuplicates}
                </button>
                <button
                  className="text-xs px-2 py-1 rounded border border-[var(--chrome-border)] hover:bg-[var(--chrome-hover)] transition-colors"
                  onClick={deselectAll}
                >
                  {t.duplicateDetector.deselectAll}
                </button>
                <button
                  className="text-xs px-2 py-1 rounded border border-[var(--chrome-border)] hover:bg-[var(--chrome-hover)] transition-colors"
                  onClick={() => scan(targetPath)}
                >
                  {t.duplicateDetector.rescan}
                </button>
              </div>

              {/* グループ一覧 */}
              {groups.map((group) => (
                <DuplicateGroupCard key={group.hash} group={group} />
              ))}
            </div>
          )}
        </div>

        {/* フッター */}
        {groups.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--chrome-border)]">
            <span className="text-sm text-[var(--chrome-text-dim)]">
              {totalSelectedCount > 0
                ? `${totalSelectedCount} ${t.duplicateDetector.filesSelected}`
                : t.duplicateDetector.selectFilesToDelete}
            </span>
            <button
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={totalSelectedCount === 0 || deleting}
              onClick={handleDelete}
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {deleting ? t.duplicateDetector.deleting : t.duplicateDetector.deleteSelected}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
