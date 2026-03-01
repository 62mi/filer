import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { FileEntry } from "../types";
import { buildGoogleDocsUrls, getPreviewType, type PreviewType } from "../utils/previewConstants";

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
  /** Google Docs埋め込みプレビューURL */
  googleDocsUrl: string | null;
  /** Google Docsの元URL（ブラウザで開く用） */
  googleDocsOriginalUrl: string | null;
  /** Google Docsファイルの読み込みに失敗したか（仮想FS等） */
  googleDocsReadFailed: boolean;
  /** convertFileSrc URL（フォント） */
  fontUrl: string | null;
}

const INITIAL_STATE: PreviewState = {
  type: "unsupported",
  loading: false,
  imageUrl: null,
  textContent: null,
  mediaUrl: null,
  videoThumbnail: null,
  pdfUrl: null,
  googleDocsUrl: null,
  googleDocsOriginalUrl: null,
  googleDocsReadFailed: false,
  fontUrl: null,
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

      case "font": {
        const url = convertFileSrc(path);
        setState((s) => ({
          ...s,
          loading: false,
          fontUrl: url,
        }));
        break;
      }

      case "psd": {
        const url = convertFileSrc(path);
        setState((s) => ({
          ...s,
          loading: false,
          imageUrl: url,
        }));
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

      case "googleDocs": {
        console.log("[googleDocs] calling read_cloud_doc_id:", path, extension);
        invoke<string>("read_cloud_doc_id", { path, extension })
          .then((result) => {
            console.log("[googleDocs] result:", result);
            if (cancelled) return;
            // resultは doc_id文字列、"url:https://..." 形式、または "hex:..." 形式
            let docId: string | null = null;
            let originalUrl: string | null = null;

            if (result.startsWith("url:")) {
              // URLが直接返ってきた場合
              originalUrl = result.slice(4);
              const urls = buildGoogleDocsUrls({ url: originalUrl }, extension);
              if (urls) {
                setState((s) => ({
                  ...s,
                  loading: false,
                  googleDocsUrl: urls.previewUrl,
                  googleDocsOriginalUrl: urls.originalUrl,
                }));
                return;
              }
            } else if (result.startsWith("hex:")) {
              // バイナリデータ（デバッグ用）- doc_id抽出を試みる
              docId = null;
            } else {
              // doc_id文字列
              docId = result;
            }

            if (docId) {
              const urls = buildGoogleDocsUrls({ doc_id: docId }, extension);
              if (urls) {
                setState((s) => ({
                  ...s,
                  loading: false,
                  googleDocsUrl: urls.previewUrl,
                  googleDocsOriginalUrl: urls.originalUrl,
                }));
                return;
              }
            }

            setState((s) => ({ ...s, loading: false, googleDocsReadFailed: true }));
          })
          .catch((err) => {
            console.error("[googleDocs] error:", err);
            if (!cancelled) setState((s) => ({ ...s, loading: false, googleDocsReadFailed: true }));
          });
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
