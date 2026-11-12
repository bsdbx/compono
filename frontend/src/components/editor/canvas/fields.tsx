"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const FIELD =
  "nodrag nopan flex h-6 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-node-field px-2";

/** A text field on a node: its label to the left, the value to the right. */
export function TextField({
  label,
  value,
  onChange,
  showLabel = true,
  className,
  onBlur,
}: {
  label: string;
  value: string;
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
  onChange,
  showLabel = true,
  className,
}: {
  label: string;
  value: number | null;
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
    <span className="relative flex w-full">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(FIELD, "appearance-none pr-6 text-foreground", className)}
      >
        {all.map((option) => (
          <option key={option} value={option}>
            {names[option] ?? (option === "" ? "None" : option)}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </span>
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
