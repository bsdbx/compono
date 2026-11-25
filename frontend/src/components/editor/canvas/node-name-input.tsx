import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { NODE_NAME_LIMIT, nodeName } from "./node-size";

/** An inline name. Validated identifiers retain their exact text. */
export function NodeNameInput({
  name,
  onSave,
  onDone,
  onValueChange,
  validate,
  label = "Node name",
  className,
}: {
  name: string;
  onSave: (name: string) => void;
  onDone: () => void;
  onValueChange?: (value: string) => void;
  validate?: (value: string) => boolean;
  label?: string;
  className?: string;
}) {
  const [value, setValue] = useState(() => (validate ? name : nodeName(name)));
  const valid = validate?.(value) ?? true;
  const finished = useRef(false);
  function finish(save: boolean) {
    if (finished.current) return;
    finished.current = true;
    if (save && valid) onSave(validate ? value : nodeName(value));
    onDone();
  }
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: the user explicitly starts renaming a node
      autoFocus
      aria-label={label}
      aria-invalid={!valid || undefined}
      autoComplete="off"
      spellCheck={false}
      maxLength={validate ? undefined : NODE_NAME_LIMIT}
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
          if (event.key === "Enter" && !valid) return;
          finish(event.key === "Enter");
        }
      }}
      onContextMenu={(event) => event.stopPropagation()}
      className={cn(
        "nodrag nowheel h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none selection:bg-primary/40 focus-visible:outline-none",
        !valid && "text-error",
        className,
      )}
    />
  );
}
