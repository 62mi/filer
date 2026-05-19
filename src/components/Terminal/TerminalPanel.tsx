import { Loader2, Trash2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n";
import { useTerminalStore } from "../../stores/terminalStore";

export function TerminalPanel() {
  const t = useTranslation();
  const isOpen = useTerminalStore((s) => s.isOpen);
  const height = useTerminalStore((s) => s.height);
  const cwd = useTerminalStore((s) => s.cwd);
  const shell = useTerminalStore((s) => s.shell);
  const entries = useTerminalStore((s) => s.entries);
  const running = useTerminalStore((s) => s.running);

  const close = useTerminalStore((s) => s.close);
  const setHeight = useTerminalStore((s) => s.setHeight);
  const setShell = useTerminalStore((s) => s.setShell);
  const clear = useTerminalStore((s) => s.clear);
  const runCommand = useTerminalStore((s) => s.runCommand);
  const navigateHistory = useTerminalStore((s) => s.navigateHistory);
  const resetHistoryCursor = useTerminalStore((s) => s.resetHistoryCursor);

  const prompt = shell === "cmd" ? ">" : "PS >";

  const [draft, setDraft] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // パネルを開いたら入力にフォーカス
  useEffect(() => {
    if (isOpen) {
      // 開いた直後はDOMマウントが先なので次フレームでフォーカス
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [isOpen]);

  // 新しい出力が追加されたら一番下にスクロール
  useLayoutEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [entries]);

  // リサイズハンドル
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      // 画面下端からの距離 = 期待するパネル高さ
      const newHeight = window.innerHeight - e.clientY;
      setHeight(newHeight);
    };
    const onUp = () => setDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragging, setHeight]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = draft.trim();
    if (!cmd || running) return;
    setDraft("");
    resetHistoryCursor();

    // ローカルで `clear` / `cls` をログクリアに割り当て（POSIX/Windows両方の感覚に合わせる）
    if (cmd === "clear" || cmd === "cls") {
      clear();
      return;
    }
    await runCommand(cmd);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab") {
      // フォーカスがパネル外に逃げないように吸収（補完は未対応）
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDraft(navigateHistory(-1, draft));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setDraft(navigateHistory(1, draft));
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
      // Ctrl+L: ログクリア（ターミナル慣習）
      e.preventDefault();
      clear();
    }
  };

  return (
    <div
      className="shrink-0 flex flex-col border-t border-[var(--chrome-border)]"
      style={{ height, background: "#1a1a1a", color: "#e5e5e5" }}
    >
      {/* リサイズハンドル */}
      <div
        className={`h-1 cursor-row-resize shrink-0 transition-colors ${
          dragging ? "bg-[var(--accent)]" : "bg-[var(--chrome-border)] hover:bg-[var(--accent)]"
        }`}
        onMouseDown={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
      />

      {/* ヘッダー */}
      <div className="flex items-center px-3 h-7 shrink-0 bg-[#252525] border-b border-[#333] text-xs">
        <span className="font-medium text-[#ccc]">{t.terminal.title}</span>

        {/* シェル切替セレクター */}
        <div className="ml-2 flex items-center gap-0.5 bg-[#1a1a1a] rounded p-0.5">
          <button
            type="button"
            className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
              shell === "powershell"
                ? "bg-[var(--accent)] text-white"
                : "text-[#999] hover:text-[#ccc]"
            }`}
            onClick={() => setShell("powershell")}
            disabled={running}
            title="PowerShell"
          >
            PowerShell
          </button>
          <button
            type="button"
            className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
              shell === "cmd" ? "bg-[var(--accent)] text-white" : "text-[#999] hover:text-[#ccc]"
            }`}
            onClick={() => setShell("cmd")}
            disabled={running}
            title="cmd.exe"
          >
            cmd
          </button>
        </div>

        <span className="mx-2 text-[#555]">|</span>
        <span className="truncate text-[#9aa] font-mono" title={cwd}>
          {cwd || "—"}
        </span>
        {running && (
          <span className="ml-2 flex items-center gap-1 text-[var(--accent)]">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{t.terminal.runningHint}</span>
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          className="p-1 rounded hover:bg-[#3a3a3a] text-[#999]"
          onClick={clear}
          title={t.terminal.clearHint}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          className="p-1 rounded hover:bg-[#3a3a3a] text-[#999]"
          onClick={close}
          title={t.terminal.closeHint}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 出力ログ */}
      <div
        ref={logRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-[1.5] whitespace-pre-wrap break-words"
      >
        {entries.length === 0 ? (
          <div className="text-[#777] italic">{t.terminal.emptyHint}</div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="mb-2">
              {/* プロンプト行 */}
              <div className="flex items-start gap-2">
                <span className="text-[#7aa] shrink-0" title={entry.cwd}>
                  {entry.shell === "cmd" ? ">" : "PS >"}
                </span>
                <span className="text-[#e8e8e8] break-all">{entry.command}</span>
              </div>
              {/* 標準出力 */}
              {entry.stdout && <div className="text-[#d4d4d4]">{entry.stdout}</div>}
              {/* 標準エラー */}
              {entry.stderr && <div className="text-[#ff8a8a]">{entry.stderr}</div>}
              {/* 終了コード（0以外のときだけ目立たせる） */}
              {!entry.running && entry.exitCode !== null && entry.exitCode !== 0 && (
                <div className="text-[#ff8a8a] text-[11px] mt-0.5">
                  [{t.terminal.exitCodeLabel}: {entry.exitCode}]
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 入力フォーム */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 flex items-center px-3 py-1.5 bg-[#141414] border-t border-[#333]"
      >
        <span className="text-[#7aa] font-mono text-[12px] mr-2 shrink-0">{prompt}</span>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            resetHistoryCursor();
          }}
          onKeyDown={handleKeyDown}
          placeholder={t.terminal.placeholder}
          disabled={running}
          spellCheck={false}
          autoComplete="off"
          className="flex-1 bg-transparent border-0 outline-none font-mono text-[12px] text-[#e5e5e5] placeholder:text-[#555] disabled:opacity-50"
        />
      </form>
    </div>
  );
}
