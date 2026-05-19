import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n";
import { useTerminalStore } from "../../stores/terminalStore";

interface PtyDataPayload {
  session_id: string;
  data: string;
}

interface PtyExitPayload {
  session_id: string;
  exit_code: number | null;
}

// base64 → Uint8Array（PTY バイト列の復元用）
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function TerminalPanel() {
  const t = useTranslation();
  const isOpen = useTerminalStore((s) => s.isOpen);
  const height = useTerminalStore((s) => s.height);
  const initialCwd = useTerminalStore((s) => s.initialCwd);
  const shell = useTerminalStore((s) => s.shell);

  const close = useTerminalStore((s) => s.close);
  const setHeight = useTerminalStore((s) => s.setHeight);
  const setShell = useTerminalStore((s) => s.setShell);
  const setSessionId = useTerminalStore((s) => s.setSessionId);

  const containerRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // リサイズハンドルのドラッグ
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      setHeight(window.innerHeight - e.clientY);
    };
    const onUp = () => setDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragging, setHeight]);

  // xterm + PTY セッションの初期化／クリーンアップ
  // isOpen / shell が変わるたびに再構築する
  useEffect(() => {
    if (!isOpen) return;
    const containerEl = containerRef.current;
    if (!containerEl) return;
    if (!initialCwd) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily:
        '"Cascadia Mono", "Cascadia Code", "Consolas", "Yu Gothic UI", "Meiryo", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: {
        background: "#1a1a1a",
        foreground: "#e5e5e5",
        cursor: "#e5e5e5",
        selectionBackground: "#5c8bff66",
      },
      allowProposedApi: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerEl);
    // 次フレームで fit すると DOM サイズ計測が安定する
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {
        // ignore
      }
    });
    term.focus();

    let disposed = false;
    let dataUnlisten: UnlistenFn | null = null;
    let exitUnlisten: UnlistenFn | null = null;

    // 入力をPTYへ流す
    const inputDisposable = term.onData((data) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      invoke("pty_write", { sessionId: sid, data }).catch(() => {
        // best-effort
      });
    });

    // 出力イベント購読 → xterm へ書き込み
    listen<PtyDataPayload>("pty-data", (event) => {
      if (event.payload.session_id !== sessionIdRef.current) return;
      const bytes = base64ToBytes(event.payload.data);
      term.write(bytes);
    })
      .then((un) => {
        if (disposed) un();
        else dataUnlisten = un;
      })
      .catch(() => {});

    listen<PtyExitPayload>("pty-exit", (event) => {
      if (event.payload.session_id !== sessionIdRef.current) return;
      term.writeln("");
      term.writeln(`\x1b[90m[Process exited: ${event.payload.exit_code ?? "?"}]\x1b[0m`);
      sessionIdRef.current = null;
      setSessionId(null);
    })
      .then((un) => {
        if (disposed) un();
        else exitUnlisten = un;
      })
      .catch(() => {});

    // セッション起動
    (async () => {
      try {
        const sid = await invoke<string>("pty_open", {
          cwd: initialCwd,
          shell,
          cols: term.cols,
          rows: term.rows,
        });
        if (disposed) {
          // 起動完了前にアンマウントされた場合は即閉じる
          invoke("pty_close", { sessionId: sid }).catch(() => {});
          return;
        }
        sessionIdRef.current = sid;
        setSessionId(sid);
      } catch (err) {
        term.writeln(
          `\r\n\x1b[31m[Failed to start ${shell}: ${
            err instanceof Error ? err.message : String(err)
          }]\x1b[0m`,
        );
      }
    })();

    // コンテナのサイズ変動を検知して fit + PTY リサイズ
    const ro = new ResizeObserver(() => {
      if (disposed) return;
      try {
        fit.fit();
      } catch {
        return;
      }
      const sid = sessionIdRef.current;
      if (sid) {
        invoke("pty_resize", {
          sessionId: sid,
          cols: term.cols,
          rows: term.rows,
        }).catch(() => {});
      }
    });
    ro.observe(containerEl);

    return () => {
      disposed = true;
      ro.disconnect();
      inputDisposable.dispose();
      dataUnlisten?.();
      exitUnlisten?.();
      const sid = sessionIdRef.current;
      sessionIdRef.current = null;
      setSessionId(null);
      if (sid) {
        invoke("pty_close", { sessionId: sid }).catch(() => {});
      }
      term.dispose();
    };
  }, [isOpen, shell, initialCwd, setSessionId]);

  if (!isOpen) return null;

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
          {(["powershell", "cmd", "pwsh"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                shell === s
                  ? "bg-[var(--accent)] text-white"
                  : "text-[#999] hover:text-[#ccc]"
              }`}
              onClick={() => setShell(s)}
              title={s === "pwsh" ? "PowerShell 7+" : s === "cmd" ? "cmd.exe" : "Windows PowerShell"}
            >
              {s === "pwsh" ? "pwsh" : s === "cmd" ? "cmd" : "PowerShell"}
            </button>
          ))}
        </div>

        <span className="mx-2 text-[#555]">|</span>
        <span className="truncate text-[#9aa] font-mono" title={initialCwd}>
          {initialCwd || "—"}
        </span>

        <div className="flex-1" />
        <button
          type="button"
          className="p-1 rounded hover:bg-[#3a3a3a] text-[#999]"
          onClick={close}
          title={t.terminal.closeHint}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* xterm.js を載せるコンテナ */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden px-2 py-1" />
    </div>
  );
}
