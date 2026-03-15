import { useCallback, useEffect, useRef } from "react";
import { useSettingsStore } from "../stores/settingsStore";

/**
 * メディア再生の共通制御フック
 * - 音量の同期（QuickLook/PreviewPanel間で共有）
 * - ウィンドウ最小化時の一時停止・復元時の再開
 * - 自動再生設定の反映
 */
export function useMediaPlayback() {
  const mediaAutoPlay = useSettingsStore((s) => s.mediaAutoPlay);
  const mediaVolume = useSettingsStore((s) => s.mediaVolume);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement | null>(null);
  const wasPlayingRef = useRef(false);

  // 音量変更をストアに同期
  const handleVolumeChange = useCallback(() => {
    const el = mediaRef.current;
    if (el) {
      setSetting("mediaVolume", el.volume);
    }
  }, [setSetting]);

  // refコールバック: 要素にマウントされたら音量を設定
  const setMediaRef = useCallback(
    (el: HTMLAudioElement | HTMLVideoElement | null) => {
      mediaRef.current = el;
      if (el) {
        el.volume = mediaVolume;
      }
    },
    [mediaVolume],
  );

  // ウィンドウ最小化時の一時停止・復元時の再開
  useEffect(() => {
    const handleVisibility = () => {
      const el = mediaRef.current;
      if (!el) return;

      if (document.hidden) {
        // 最小化: 再生中なら一時停止
        wasPlayingRef.current = !el.paused;
        if (!el.paused) {
          el.pause();
        }
      } else {
        // 復元: 再生中だったなら再開
        if (wasPlayingRef.current) {
          el.play().catch(() => {});
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  return {
    mediaRef: setMediaRef,
    mediaAutoPlay,
    handleVolumeChange,
  };
}
