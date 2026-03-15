import { FileText } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "../../i18n";
import type { ContentSearchMatch } from "../../stores/panelStore";
import { useExplorerStore } from "../../stores/panelStore";

/** 検索クエリにマッチする部分をハイライト表示する */
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: { text: string; highlight: boolean }[] = [];
  let lastIndex = 0;

  let idx = lowerText.indexOf(lowerQuery, lastIndex);
  while (idx !== -1) {
    if (idx > lastIndex) {
      parts.push({ text: text.slice(lastIndex, idx), highlight: false });
    }
    parts.push({ text: text.slice(idx, idx + query.length), highlight: true });
    lastIndex = idx + query.length;
    idx = lowerText.indexOf(lowerQuery, lastIndex);
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlight: false });
  }

  return (
    <>
      {parts.map((part, i) =>
        part.highlight ? (
          <mark
            key={`h-${i}-${part.text}`}
            className="bg-yellow-200 text-inherit rounded-sm px-0.5"
          >
            {part.text}
          </mark>
        ) : (
          <span key={`t-${i}-${part.text}`}>{part.text}</span>
        ),
      )}
    </>
  );
}

interface ContentSearchResultsProps {
  results: ContentSearchMatch[];
  query: string;
}

/** ファイル内容検索の結果表示コンポーネント */
export function ContentSearchResults({ results, query }: ContentSearchResultsProps) {
  const t = useTranslation();
  const loadDirectory = useExplorerStore((s) => s.loadDirectory);

  // ファイルごとにグループ化
  const grouped = useCallback(() => {
    const map = new Map<string, ContentSearchMatch[]>();
    for (const match of results) {
      const existing = map.get(match.path);
      if (existing) {
        existing.push(match);
      } else {
        map.set(match.path, [match]);
      }
    }
    return map;
  }, [results])();

  /** クリックでそのファイルの親ディレクトリに移動 */
  const handleClickResult = useCallback(
    (filePath: string) => {
      // 親ディレクトリを取得
      const normalized = filePath.replace(/\//g, "\\");
      const lastSep = normalized.lastIndexOf("\\");
      if (lastSep <= 0) return;
      const parentDir =
        lastSep === 2 && normalized[1] === ":"
          ? normalized.substring(0, 3)
          : normalized.substring(0, lastSep);
      loadDirectory(parentDir);
    },
    [loadDirectory],
  );

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-[#666] bg-[#fafafa] border-b border-[#e5e5e5] shrink-0">
        <FileText className="w-3.5 h-3.5" />
        <span>
          {results.length} {t.navigationBar.contentSearchResults}
        </span>
      </div>

      {/* 結果リスト */}
      <div className="flex-1 overflow-y-auto">
        {Array.from(grouped.entries()).map(([filePath, matches]) => {
          const fileName = filePath.replace(/\//g, "\\").split("\\").pop() || filePath;
          return (
            <div key={filePath} className="border-b border-[#f0f0f0]">
              {/* ファイル名ヘッダー */}
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-medium text-[#333] bg-[#f8f8f8] hover:bg-[#f0f0f0] transition-colors text-left"
                onClick={() => handleClickResult(filePath)}
                title={filePath}
              >
                <FileText className="w-3 h-3 text-[#999] shrink-0" />
                <span className="truncate">{fileName}</span>
                <span className="text-[#999] ml-auto shrink-0">
                  {matches.length} {matches.length === 1 ? "match" : "matches"}
                </span>
              </button>

              {/* マッチ行 */}
              {matches.map((match) => (
                <button
                  key={`${match.path}:${match.line_number}`}
                  className="flex w-full text-left hover:bg-[#f5f5f5] transition-colors group"
                  onClick={() => handleClickResult(match.path)}
                >
                  <div className="flex flex-col w-full px-3 py-1">
                    {/* コンテキスト（前） */}
                    {match.context_before.map((line, i) => (
                      <div
                        key={`before-${match.line_number - match.context_before.length + i}`}
                        className="flex items-start text-xs text-[#aaa] font-mono leading-5"
                      >
                        <span className="w-10 shrink-0 text-right pr-2 select-none text-[#ccc]">
                          {match.line_number - match.context_before.length + i}
                        </span>
                        <span className="truncate">{line || "\u00A0"}</span>
                      </div>
                    ))}

                    {/* マッチした行 */}
                    <div className="flex items-start text-xs font-mono leading-5 bg-yellow-50 -mx-3 px-3 rounded-sm">
                      <span className="w-10 shrink-0 text-right pr-2 select-none text-[var(--accent)] font-medium">
                        {match.line_number}
                      </span>
                      <span className="text-[#333] truncate">
                        <HighlightText text={match.line_content} query={query} />
                      </span>
                    </div>

                    {/* コンテキスト（後） */}
                    {match.context_after.map((line, i) => (
                      <div
                        key={`after-${match.line_number + 1 + i}`}
                        className="flex items-start text-xs text-[#aaa] font-mono leading-5"
                      >
                        <span className="w-10 shrink-0 text-right pr-2 select-none text-[#ccc]">
                          {match.line_number + 1 + i}
                        </span>
                        <span className="truncate">{line || "\u00A0"}</span>
                      </div>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
