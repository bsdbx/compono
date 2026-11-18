import { useEffect, useState } from "react";

const LIBRARY_MIN = 180;
const LIBRARY_COLLAPSED = 44;
const INSPECTOR_MIN = 280;
const PREVIEW_MIN = 120;
const CANVAS_MIN = 320;
const PROPERTIES_MIN = 160;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** Panel sizes belong to the editor, so they survive switching components. */
export function usePanels() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [bounds, setBounds] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight - 41,
  }));
  const [library, setLibrary] = useState(224);
  const [collapsed, setCollapsed] = useState(false);
  const [animateLibrary, setAnimateLibrary] = useState(false);
  const [inspector, setInspector] = useState(314);
  const [preview, setPreview] = useState(226);

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
        setCollapsed(next);
      },
      onChange: (width: number) => {
        setAnimateLibrary(false);
        setCollapsed(width === LIBRARY_COLLAPSED);
        if (width !== LIBRARY_COLLAPSED) setLibrary(width);
      },
    },
    inspector: {
      width: inspectorWidth,
      min: INSPECTOR_MIN,
      max: inspectorMax,
      onChange: setInspector,
    },
    preview: {
      height: clamp(preview, PREVIEW_MIN, previewMax),
      min: PREVIEW_MIN,
      max: previewMax,
      onChange: setPreview,
    },
  };
}
