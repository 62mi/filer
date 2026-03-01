import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

export function WindowControls({ height }: { height?: number }) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    // 初期状態を取得
    appWindow.isMaximized().then(setMaximized);

    // リサイズイベントで最大化状態を監視（スナップ操作にも対応）
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const appWindow = getCurrentWindow();

  return (
    <div className="flex items-center shrink-0" style={{ height }}>
      {/* 最小化 */}
      <button
        type="button"
        className="w-[46px] flex items-center justify-center hover:bg-[var(--tab-hover)] transition-colors"
        style={{ height }}
        onClick={() => appWindow.minimize()}
        title="最小化"
      >
        <svg width="10" height="1" viewBox="0 0 10 1">
          <rect width="10" height="1" fill="currentColor" />
        </svg>
      </button>

      {/* 最大化 / 復元 */}
      <button
        type="button"
        className="w-[46px] flex items-center justify-center hover:bg-[var(--tab-hover)] transition-colors"
        style={{ height }}
        onClick={() => appWindow.toggleMaximize()}
        title={maximized ? "元に戻す" : "最大化"}
      >
        {maximized ? (
          // 復元アイコン（重なった四角）
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            {/* 背面の四角 */}
            <rect
              x="2.5"
              y="0.5"
              width="7"
              height="7"
              stroke="currentColor"
              strokeWidth="1"
              fill="none"
            />
            {/* 前面の四角 */}
            <rect
              x="0.5"
              y="2.5"
              width="7"
              height="7"
              stroke="currentColor"
              strokeWidth="1"
              fill="var(--tab-bar-bg, #e8e8e8)"
            />
          </svg>
        ) : (
          // 最大化アイコン（四角）
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect
              x="0.5"
              y="0.5"
              width="9"
              height="9"
              rx="0.5"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        )}
      </button>

      {/* 閉じる */}
      <button
        type="button"
        className="w-[46px] flex items-center justify-center hover:bg-[#c42b1c] hover:text-white transition-colors"
        style={{ height }}
        onClick={() => appWindow.close()}
        title="閉じる"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  );
}
