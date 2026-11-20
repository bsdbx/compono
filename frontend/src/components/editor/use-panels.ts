import { useEffect, useState } from "react";

const LIBRARY_MIN = 180;
const LIBRARY_COLLAPSED = 44;
const INSPECTOR_MIN = 280;
const PREVIEW_MIN = 120;
const CANVAS_MIN = 320;
const PROPERTIES_MIN = 160;
const STORAGE_KEY = "compono:editor-layout";
const DEFAULT_LAYOUT = {
  library: 224,
  collapsed: false,
  inspector: 314,
  preview: 226,
};

function readLayout() {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "null",
    );
    if (!saved || typeof saved !== "object") return DEFAULT_LAYOUT;
    const dimension = (value: unknown, min: number, fallback: number) =>
      typeof value === "number" && Number.isFinite(value) && value >= min
        ? value
        : fallback;
    return {
      library: dimension(
        "library" in saved ? saved.library : undefined,
        LIBRARY_MIN,
        DEFAULT_LAYOUT.library,
      ),
      collapsed: "collapsed" in saved && saved.collapsed === true,
      inspector: dimension(
        "inspector" in saved ? saved.inspector : undefined,
        INSPECTOR_MIN,
        DEFAULT_LAYOUT.inspector,
      ),
      preview: dimension(
        "preview" in saved ? saved.preview : undefined,
        PREVIEW_MIN,
        DEFAULT_LAYOUT.preview,
      ),
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** One saved editor layout across components, projects, teams and page reloads. */
export function usePanels() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [bounds, setBounds] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight - 41,
  }));
  const [layout, setLayout] = useState(readLayout);
  const { library, collapsed, inspector, preview } = layout;
  const [animateLibrary, setAnimateLibrary] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      /* Resizing still works when browser storage is unavailable. */
    }
  }, [layout]);

  useEffect(() => {
    if (!container) return;
    const measure = () => {
      if (container.clientWidth && container.clientHeight) {
        setBounds({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    measure();
    return () => observer.disconnect();
  }, [container]);

  const available = bounds.width - CANVAS_MIN;
  const inspectorWidth = clamp(
    inspector,
    INSPECTOR_MIN,
    available - (collapsed ? LIBRARY_COLLAPSED : LIBRARY_MIN),
  );
  const libraryMax = Math.max(LIBRARY_MIN, available - inspectorWidth);
  const libraryWidth = collapsed
    ? LIBRARY_COLLAPSED
    : clamp(library, LIBRARY_MIN, libraryMax);
  const inspectorMax = Math.max(INSPECTOR_MIN, available - libraryWidth);
  const previewMax = Math.max(PREVIEW_MIN, bounds.height - PROPERTIES_MIN);

  return {
    container: setContainer,
    library: {
      width: libraryWidth,
      min: LIBRARY_MIN,
      max: libraryMax,
      collapsedSize: LIBRARY_COLLAPSED,
      collapsed,
      animate: animateLibrary,
      onCollapsedChange: (next: boolean) => {
        setAnimateLibrary(true);
        setLayout((before) => ({ ...before, collapsed: next }));
      },
      onChange: (width: number) => {
        setAnimateLibrary(false);
        setLayout((before) => ({
          ...before,
          collapsed: width === LIBRARY_COLLAPSED,
          library: width === LIBRARY_COLLAPSED ? before.library : width,
        }));
      },
    },
    inspector: {
      width: inspectorWidth,
      min: INSPECTOR_MIN,
      max: inspectorMax,
      onChange: (width: number) =>
        setLayout((before) => ({ ...before, inspector: width })),
    },
    preview: {
      height: clamp(preview, PREVIEW_MIN, previewMax),
      min: PREVIEW_MIN,
      max: previewMax,
      onChange: (height: number) =>
        setLayout((before) => ({ ...before, preview: height })),
    },
  };
}
