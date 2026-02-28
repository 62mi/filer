import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { FileEntry } from "../types";
import { getPreviewType, type PreviewType } from "../utils/previewConstants";

export interface PreviewState {
  type: PreviewType;
  loading: boolean;
  /** convertFileSrc URL（画像） */
  imageUrl: string | null;
  /** テキスト内容 */
  textContent: string | null;
  /** convertFileSrc URL（動画/音声） */
  mediaUrl: string | null;
  /** FFmpeg抽出サムネイル（data URI） */
  videoThumbnail: string | null;
  /** convertFileSrc URL（PDF） */
  pdfUrl: string | null;
}

const INITIAL_STATE: PreviewState = {
  type: "unsupported",
  loading: false,
  imageUrl: null,
  textContent: null,
  mediaUrl: null,
  videoThumbnail: null,
  pdfUrl: null,
};

export function usePreview(
  entry: FileEntry | null,
  opts?: { maxTextBytes?: number },
): PreviewState {
  const [state, setState] = useState<PreviewState>(INITIAL_STATE);
  const maxTextBytes = opts?.maxTextBytes ?? 100000;

  const path = entry?.path ?? null;
  const isDir = entry?.is_dir ?? false;
  const extension = entry?.extension ?? "";

  useEffect(() => {
    if (!path || isDir) {
      setState(INITIAL_STATE);
      return;
    }

    const type = getPreviewType(extension);
    // パス変更時にリセット
    setState({ ...INITIAL_STATE, type, loading: true });

    let cancelled = false;

    switch (type) {
      case "image": {
        const url = convertFileSrc(path);
        setState((s) => ({
          ...s,
          loading: false,
          imageUrl: url,
        }));
        break;
      }

      case "text": {
        invoke<string>("read_text_file", {
          path,
          maxBytes: maxTextBytes,
        })
          .then((content) => {
            if (!cancelled) setState((s) => ({ ...s, loading: false, textContent: content }));
          })
          .catch(() => {
            if (!cancelled) setState((s) => ({ ...s, loading: false }));
          });
        break;
      }

      case "video":
      case "audio": {
        const url = convertFileSrc(path);
        setState((s) => ({
          ...s,
          loading: false,
          mediaUrl: url,
        }));
        break;
      }

      case "videoThumbnail": {
        invoke<string>("extract_video_thumbnail", {
          path,
          size: 480,
        })
          .then((dataUri) => {
            if (!cancelled)
              setState((s) => ({
                ...s,
                loading: false,
                videoThumbnail: dataUri,
              }));
          })
          .catch(() => {
            if (!cancelled) setState((s) => ({ ...s, loading: false }));
          });
        break;
      }

      case "pdf": {
        const url = convertFileSrc(path);
        setState((s) => ({
          ...s,
          loading: false,
          pdfUrl: url,
        }));
        break;
      }

      default:
        setState((s) => ({ ...s, loading: false }));
    }

    return () => {
      cancelled = true;
    };
  }, [path, isDir, extension, maxTextBytes]);

  return state;
}
