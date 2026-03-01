import { useCallback, useEffect, useRef, useState } from "react";

interface ImageControlsState {
  scale: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  panX: number;
  panY: number;
}

const INITIAL: ImageControlsState = {
  scale: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
  panX: 0,
  panY: 0,
};

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
const ZOOM_FACTOR = 1.15;

export function useImageControls(entryPath: string | null) {
  const [state, setState] = useState<ImageControlsState>(INITIAL);
  const [cacheBust, setCacheBust] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const containerNodeRef = useRef<HTMLDivElement | null>(null);

  // ファイルが変わったらリセット
  useEffect(() => {
    setState(INITIAL);
    setCacheBust(0);
  }, [entryPath]);

  // ホイールズーム（non-passive で preventDefault）
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    setState((s) => ({
      ...s,
      scale: Math.min(Math.max(s.scale * factor, MIN_SCALE), MAX_SCALE),
    }));
  }, []);

  // コンテナの callback ref（wheel リスナー登録・解除）
  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (containerNodeRef.current) {
        containerNodeRef.current.removeEventListener("wheel", handleWheel);
      }
      containerNodeRef.current = node;
      if (node) {
        node.addEventListener("wheel", handleWheel, { passive: false });
      }
    },
    [handleWheel],
  );

  const zoomIn = useCallback(() => {
    setState((s) => ({ ...s, scale: Math.min(s.scale * ZOOM_FACTOR, MAX_SCALE) }));
  }, []);

  const zoomOut = useCallback(() => {
    setState((s) => ({ ...s, scale: Math.max(s.scale / ZOOM_FACTOR, MIN_SCALE) }));
  }, []);

  const rotateCcw = useCallback(() => {
    setState((s) => ({ ...s, rotation: (s.rotation + 270) % 360 }));
  }, []);

  const rotateCw = useCallback(() => {
    setState((s) => ({ ...s, rotation: (s.rotation + 90) % 360 }));
  }, []);

  const toggleFlipH = useCallback(() => {
    setState((s) => ({ ...s, flipH: !s.flipH }));
  }, []);

  const toggleFlipV = useCallback(() => {
    setState((s) => ({ ...s, flipV: !s.flipV }));
  }, []);

  const resetAll = useCallback(() => {
    setState(INITIAL);
  }, []);

  const resetAfterSave = useCallback(() => {
    setState(INITIAL);
    setCacheBust((c) => c + 1);
  }, []);

  // ドラッグでパン（ズーム時のみ有効）
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (stateRef.current.scale <= 1) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const initPanX = stateRef.current.panX;
    const initPanY = stateRef.current.panY;

    const handleMove = (ev: MouseEvent) => {
      setState((s) => ({
        ...s,
        panX: initPanX + (ev.clientX - startX),
        panY: initPanY + (ev.clientY - startY),
      }));
    };
    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }, []);

  const isModified = state.rotation !== 0 || state.flipH || state.flipV;
  const isTransformed = isModified || state.scale !== 1 || state.panX !== 0 || state.panY !== 0;

  const transforms: string[] = [];
  if (state.panX || state.panY) transforms.push(`translate(${state.panX}px, ${state.panY}px)`);
  if (state.scale !== 1) transforms.push(`scale(${state.scale})`);
  if (state.rotation) transforms.push(`rotate(${state.rotation}deg)`);
  if (state.flipH) transforms.push("scaleX(-1)");
  if (state.flipV) transforms.push("scaleY(-1)");

  const transformStyle: React.CSSProperties = {
    transform: transforms.length > 0 ? transforms.join(" ") : "none",
    transformOrigin: "center center",
    cursor: state.scale > 1 ? "grab" : "default",
  };

  return {
    ...state,
    containerRef,
    transformStyle,
    cacheBust,
    zoomIn,
    zoomOut,
    rotateCcw,
    rotateCw,
    toggleFlipH,
    toggleFlipV,
    resetAll,
    resetAfterSave,
    isModified,
    isTransformed,
    onMouseDown,
    zoomPercent: Math.round(state.scale * 100),
  };
}
