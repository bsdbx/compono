import { ChevronDown } from "lucide-react";
import { Select } from "radix-ui";
import { useState } from "react";
import { cn } from "@/lib/utils";

const FIELD =
  "nodrag nopan flex h-6 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-node-field px-2";

/** A text field on a node: its label to the left, the value to the right. */
export function TextField({
  label,
  value,
  placeholder,
  onChange,
  showLabel = true,
  className,
  onBlur,
}: {
  label: string;
  value: string;
  placeholder?: string | undefined;
  onChange: (value: string) => void;
  showLabel?: boolean;
  className?: string;
  onBlur?: () => void;
}) {
  return (
    <label className={cn(FIELD, className)}>
      {showLabel ? (
        <span className="shrink-0 text-subtle-foreground">{label}</span>
      ) : null}
      <input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-foreground outline-none",
          showLabel ? "text-right" : "",
        )}
      />
    </label>
  );
}

/** A number field. A number that isn't finished yet, like "2.", stays as typed until it is. */
export function NumberField({
  label,
  value,
  placeholder,
  onChange,
  showLabel = true,
  className,
}: {
  label: string;
  value: number | null;
  placeholder?: string | undefined;
  onChange: (value: number | string | undefined) => void;
  showLabel?: boolean;
  className?: string;
}) {
  const shown = value === null ? "" : String(value);
  const [typed, setTyped] = useState<string>();
  return (
    <label className={cn(FIELD, className)}>
      {showLabel ? (
        <span className="shrink-0 text-subtle-foreground">{label}</span>
      ) : null}
      <input
        aria-label={label}
        inputMode="decimal"
        value={typed ?? shown}
        placeholder={placeholder}
        onChange={(event) => {
          const text = event.target.value;
          setTyped(text);
          const number = Number(text);
          // Empty is the default; what isn't a number goes to the API, which says so on the node
          onChange(
            text.trim() === ""
              ? undefined
              : Number.isFinite(number)
                ? number
                : text,
          );
        }}
        onBlur={() => setTyped(undefined)}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-foreground outline-none",
          showLabel ? "text-right" : "",
        )}
      />
    </label>
  );
}

/** A choice of options, like a tag. An empty option shows as None. */
export function ChoiceField({
  label,
  value,
  options,
  onChange,
  className,
  names = {},
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  className?: string;
  /** What an option shows as, when it isn't the option itself */
  names?: Readonly<Record<string, string>>;
}) {
  const all =
    options.includes(value) || value === "" ? options : [value, ...options];
  return (
    <Select.Root
      value={all.includes(value) ? `option:${value}` : ""}
      onValueChange={(next) => onChange(next.slice(7))}
    >
      <Select.Trigger
        aria-label={label}
        className={cn(
          FIELD,
          "justify-between text-foreground outline-none focus-visible:border-primary",
          className,
        )}
      >
        <span className="truncate">
          <Select.Value placeholder="None" />
        </span>
        <Select.Icon asChild>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="nodrag nopan nowheel z-50 max-h-72 min-w-(--radix-select-trigger-width) overflow-hidden rounded-lg border border-foreground/10 bg-popover p-1 text-foreground shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <Select.Viewport>
            {all.map((option) => (
              <Select.Item
                key={option}
                value={`option:${option}`}
                className="relative flex h-6.5 cursor-default items-center rounded-md px-2 text-xs outline-none data-highlighted:bg-highlight data-[state=checked]:text-primary"
              >
                <Select.ItemText>
                  {names[option] ?? (option === "" ? "None" : option)}
                </Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

/** An on or off switch. */
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={cn(
        "nodrag nopan relative h-4.5 w-8 shrink-0 rounded-full transition-colors",
        value ? "bg-primary" : "bg-input",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-3.5 rounded-full bg-white transition-[left]",
          value ? "left-4" : "left-0.5",
        )}
      />
    </button>
  );
}
