import { useRef, useState } from "react";

/** A node's inline display label: Enter or blur saves, Escape cancels. */
export function NodeNameInput({
  name,
  onSave,
  onDone,
  onValueChange,
}: {
  name: string;
  onSave: (name: string) => void;
  onDone: () => void;
  onValueChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(name.trim());
  const finished = useRef(false);
  function finish(save: boolean) {
    if (finished.current) return;
    finished.current = true;
    if (save) onSave(value.trim());
    onDone();
  }
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: the user explicitly starts renaming a node
      autoFocus
      aria-label="Node name"
      autoComplete="off"
      spellCheck={false}
      value={value}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        setValue(event.target.value);
        onValueChange?.(event.target.value);
      }}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          finish(event.key === "Enter");
        }
      }}
      onContextMenu={(event) => event.stopPropagation()}
      className="nodrag nowheel -mx-1.5 h-6 min-w-0 flex-1 rounded border border-selection/50 bg-field px-1.5 text-sm outline-none focus-visible:outline-none"
    />
  );
}
