import { ChevronDown, Search } from "lucide-react";
import { Popover } from "radix-ui";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Highlight } from "@/components/highlight";
import { textMatches } from "@/lib/text-matches";
import { cn } from "@/lib/utils";
import type { ChoiceMenu } from "./choice-menus";

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
        <span
          className="max-w-1/2 shrink-0 truncate text-subtle-foreground"
          title={label}
        >
          {label}
        </span>
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
        <span
          className="max-w-1/2 shrink-0 truncate text-subtle-foreground"
          title={label}
        >
          {label}
        </span>
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
  menu,
  showLabel = false,
  names = menu?.names,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  className?: string;
  menu?: ChoiceMenu | undefined;
  showLabel?: boolean;
  /** What an option shows as, when it isn't the option itself */
  names?: Readonly<Record<string, string>> | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const searchLabel = menu?.search ?? "Search options";
  const query = search.trim();
  const nameOf = (option: string) =>
    (names && Object.hasOwn(names, option) ? names[option] : undefined) ??
    (option === "" ? "None" : option);
  const all = new Set(
    value === "" || options.includes(value) ? options : [value, ...options],
  );
  const remaining = new Set(
    [...all].filter(
      (option) => !query || textMatches(nameOf(option), query).length > 0,
    ),
  );
  const sections = Object.entries(menu?.groups ?? {}).map(
    ([heading, group]) => ({
      heading,
      options: group.filter((option) => remaining.delete(option)),
    }),
  );
  sections.push({ heading: "", options: [...remaining] });
  const visible = sections.flatMap((section) => section.options);
  const indices = new Map(visible.map((option, index) => [option, index]));
  const current = Math.max(
    active === undefined ? -1 : (indices.get(active) ?? -1),
    0,
  );
  const activeId = visible.length > 0 ? `${listId}-${current}` : undefined;

  useEffect(() => {
    if (open && activeId)
      input.current?.ownerDocument
        .getElementById(activeId)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeId]);

  function changeOpen(next: boolean) {
    if (next) {
      setSearch("");
      setActive(all.has(value) ? value : undefined);
    }
    setOpen(next);
  }

  function choose(option: string) {
    if (option !== value) onChange(option);
    setOpen(false);
  }

  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      const option = visible[current];
      if (option !== undefined) choose(option);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = current + (event.key === "ArrowDown" ? 1 : -1);
      setActive(visible[Math.max(0, Math.min(next, visible.length - 1))]);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              event.stopPropagation();
              changeOpen(true);
            }
          }}
          className={cn(
            FIELD,
            "justify-between text-foreground outline-none focus-visible:border-foreground/25",
            className,
          )}
        >
          {showLabel && (
            <span
              className="max-w-1/2 shrink-0 truncate text-subtle-foreground"
              title={label}
            >
              {label}
            </span>
          )}
          <span
            className={cn("min-w-0 truncate", showLabel && "flex-1 text-right")}
          >
            {nameOf(value)}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-label={label}
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            input.current?.focus({ preventScroll: true });
          }}
          className="nodrag nopan nowheel z-50 flex max-h-[min(22rem,var(--radix-popover-content-available-height))] w-(--radix-popover-trigger-width) flex-col overflow-hidden rounded-lg border border-foreground/10 bg-popover p-1 text-foreground shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <label className="mb-1 flex h-7 shrink-0 items-center gap-2 rounded-md border border-input bg-node-field px-2">
            <Search className="size-3.5 shrink-0 text-subtle-foreground" />
            <input
              ref={input}
              role="combobox"
              aria-label={searchLabel}
              aria-controls={listId}
              aria-expanded="true"
              aria-autocomplete="list"
              aria-activedescendant={activeId}
              placeholder={searchLabel}
              autoComplete="off"
              spellCheck={false}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setActive(undefined);
                if (list.current) list.current.scrollTop = 0;
              }}
              onKeyDown={navigate}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <div
            ref={list}
            id={listId}
            role="listbox"
            aria-label={label}
            className="min-h-0 overflow-y-auto overscroll-contain"
          >
            {sections
              .filter((section) => section.options.length > 0)
              .map((section) => (
                <fieldset key={section.heading} className="min-w-0">
                  {section.heading && (
                    <legend className="px-2 pt-2 pb-0.5 text-subtle-foreground text-xs">
                      {section.heading}
                    </legend>
                  )}
                  {section.options.map((option) => {
                    const index = indices.get(option);
                    const name = nameOf(option);
                    return (
                      <button
                        key={option}
                        id={`${listId}-${index}`}
                        type="button"
                        role="option"
                        aria-selected={option === value}
                        aria-label={name}
                        title={name}
                        tabIndex={-1}
                        onPointerEnter={() => setActive(option)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => choose(option)}
                        className={cn(
                          "flex h-6.5 w-full cursor-default items-center rounded-md px-2 text-left text-xs outline-none",
                          index === current && "bg-highlight",
                        )}
                      >
                        <span className="truncate">
                          <Highlight text={name} query={query} />
                        </span>
                      </button>
                    );
                  })}
                </fieldset>
              ))}
          </div>
          {visible.length === 0 && (
            <p
              role="status"
              className="px-2 py-1.5 text-subtle-foreground text-xs"
            >
              No matching options
            </p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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
