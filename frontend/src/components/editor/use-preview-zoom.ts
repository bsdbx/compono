import {
  type SetStateAction,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PreviewZoom } from "./preview-view";

function readZoom(componentId: string | undefined): PreviewZoom {
  try {
    const saved = componentId
      ? localStorage.getItem(`compono:preview-zoom:${componentId}`)
      : null;
    if (saved === "fit") return "fit";
    const value = Number(saved);
    return Number.isFinite(value) && value >= 0.01 && value <= 4 ? value : 1;
  } catch {
    return 1;
  }
}

/** A component's preview zoom, including wheel updates and Fit, across editor visits. */
export function usePreviewZoom(componentId: string | undefined) {
  const remembered = useMemo(() => readZoom(componentId), [componentId]);
  const [picked, setPicked] = useState<{
    component: string | undefined;
    zoom: PreviewZoom;
  }>();
  const zoom =
    picked?.component === componentId
      ? (picked?.zoom ?? remembered)
      : remembered;
  const current = useRef({ component: componentId, zoom });
  current.current = { component: componentId, zoom };

  const change = useCallback((next: SetStateAction<PreviewZoom>) => {
    const before = current.current;
    const value = typeof next === "function" ? next(before.zoom) : next;
    current.current = { component: before.component, zoom: value };
    setPicked(current.current);
    try {
      if (before.component)
        localStorage.setItem(
          `compono:preview-zoom:${before.component}`,
          String(value),
        );
    } catch {
      /* Zoom still works when browser storage is unavailable. */
    }
  }, []);

  return [zoom, change] as const;
}
