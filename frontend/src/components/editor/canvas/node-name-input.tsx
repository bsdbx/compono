import { useRef, useState } from "react";
import { NODE_NAME_LIMIT, nodeName } from "./node-size";

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
  const [value, setValue] = useState(() => nodeName(name));
  const finished = useRef(false);
  function finish(save: boolean) {
    if (finished.current) return;
    finished.current = true;
    if (save) onSave(nodeName(value));
    onDone();
  }
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: the user explicitly starts renaming a node
      autoFocus
      aria-label="Node name"
      autoComplete="off"
      spellCheck={false}
      maxLength={NODE_NAME_LIMIT}
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
      className="nodrag nowheel h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none focus-visible:outline-none"
    />
  );
}
