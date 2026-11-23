import { ChevronDown, ChevronRight, ChevronUp, Search, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NODE_NAME_LIMIT } from "./node-size";

const FIELD =
  "h-6 truncate px-2 text-sm outline-none focus:text-clip focus-visible:outline-none selection:bg-primary/40";

export function NodeFindPanel({
  query,
  index,
  count,
  onQuery,
  onStep,
  onRename,
  onClose,
}: {
  query: string;
  index: number;
  count: number;
  onQuery: (query: string) => void;
  onStep: (direction: -1 | 1) => void;
  onRename: (replacement: string, all: boolean) => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [replacement, setReplacement] = useState("");
  const RenameChevron = expanded ? ChevronDown : ChevronRight;
  useLayoutEffect(() => {
    const field = input.current;
    if (!field) return;
    field.focus({ preventScroll: true });
    field.setSelectionRange(field.value.length, field.value.length);
  }, []);

  return (
    <section
      aria-label="Find and rename nodes"
      data-node-find
      className="@min-[720px]/editor:top-3 @min-[720px]/editor:max-w-[calc(50%-5rem)] absolute top-12 right-3 z-20 grid w-92 max-w-[calc(100%-1.5rem)] grid-cols-[1.5rem_minmax(0,1fr)_9.25rem] items-center gap-1 rounded-lg border border-input bg-popover p-0.75 shadow-lg shadow-black/30"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-6"
        aria-label={expanded ? "Hide rename" : "Show rename"}
        title="Toggle rename"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <RenameChevron />
      </Button>
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-subtle-foreground" />
        <Input
          ref={input}
          value={query}
          maxLength={NODE_NAME_LIMIT * 2}
          aria-label="Find node names"
          placeholder="Find node names"
          title={query || undefined}
          autoComplete="off"
          spellCheck={false}
          className={`${FIELD} pl-7`}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            onStep(event.shiftKey ? -1 : 1);
          }}
        />
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <span
          role="status"
          className="min-w-0 flex-1 truncate px-1 text-right text-muted-foreground text-xs tabular-nums"
        >
          {query && (count ? `${index + 1} of ${count}` : "No matches")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-6"
          aria-label="Previous match"
          title="Previous match (Shift+Enter)"
          disabled={!count}
          onClick={() => onStep(-1)}
        >
          <ChevronUp />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-6"
          aria-label="Next match"
          title="Next match (Enter)"
          disabled={!count}
          onClick={() => onStep(1)}
        >
          <ChevronDown />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-6"
          aria-label="Close find"
          title="Close find (Escape)"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      {expanded ? (
        <>
          <Input
            aria-label="Rename to"
            placeholder="Rename to"
            title={replacement || undefined}
            value={replacement}
            maxLength={NODE_NAME_LIMIT * 2}
            autoComplete="off"
            spellCheck={false}
            className={`${FIELD} col-start-2`}
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                event.nativeEvent.isComposing ||
                !count
              )
                return;
              event.preventDefault();
              onRename(replacement, false);
            }}
          />
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              title="Rename current match"
              disabled={!count}
              onClick={() => onRename(replacement, false)}
            >
              Rename
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={!count}
              onClick={() => onRename(replacement, true)}
            >
              Rename all
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
