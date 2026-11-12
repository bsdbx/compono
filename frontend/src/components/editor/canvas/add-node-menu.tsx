"use client";

import { ChevronRight, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { NodeTypeInfo } from "@/api/types.gen";
import { cn } from "@/lib/utils";
import { accepts, SOCKET_COLOR } from "./accepts";
import { addRow, type SocketType } from "./graph";

/** A node type to add, and the input a wire goes into, when it comes from a wire. */
export type Choice = { nodeType: NodeTypeInfo; input?: string };

type Option = Choice & { label?: string; color?: string };

/** The input of the node type that takes a wire of the type, if any: an input, or a group's Add row. */
function inputFor(
  nodeType: NodeTypeInfo,
  from: SocketType,
): Option | undefined {
  const input = nodeType.sockets.inputs.find((each) =>
    accepts(each.type, from),
  );
  if (input) {
    return {
      nodeType,
      input: input.id,
      label: input.label,
      color: SOCKET_COLOR[input.type.kind ?? "any"],
    };
  }
  const group = nodeType.sockets.groups.find((each) =>
    accepts(each.type, from),
  );
  if (group) {
    return {
      nodeType,
      input: addRow(group.id),
      label: group.label,
      color: SOCKET_COLOR[group.type.kind ?? "any"],
    };
  }
  return undefined;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const at = query === "" ? -1 : text.toLowerCase().indexOf(query);
  if (at === -1) {
    return text;
  }
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-xs bg-primary/30 text-inherit">
        {text.slice(at, at + query.length)}
      </mark>
      {text.slice(at + query.length)}
    </>
  );
}

const ROW =
  "flex h-6.5 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none";

function OptionRow({
  option,
  query,
  active,
  disabled,
  showCategory,
  onActive,
  onChoose,
}: {
  option: Option;
  query: string;
  active: boolean;
  disabled: boolean;
  showCategory: boolean;
  onActive: () => void;
  onChoose: (choice: Choice) => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={disabled}
      // The graph has one already
      title={
        disabled ? `A component has one ${option.nodeType.name}` : undefined
      }
      onPointerEnter={onActive}
      onClick={() => {
        if (!disabled) {
          onChoose(option);
        }
      }}
      className={cn(
        ROW,
        active ? "bg-highlight" : "",
        disabled ? "cursor-default text-subtle-foreground" : "",
      )}
    >
      <span className="min-w-0 flex-1 truncate">
        <Highlight text={option.nodeType.name} query={query} />
      </span>
      {option.label ? (
        <span className="flex shrink-0 items-center gap-2 text-subtle-foreground">
          <span className={cn("size-2 rounded-full", option.color)} />
          {option.label}
        </span>
      ) : showCategory ? (
        <span className="shrink-0 text-subtle-foreground">
          {option.nodeType.category}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Adds a node: by category, by searching, or, from a wire, only the nodes that take it.
 * Arrows move, Enter adds and Escape closes.
 */
export function AddNodeMenu({
  x,
  y,
  nodeTypes,
  unavailable,
  from,
  onChoose,
  onClose,
}: {
  x: number;
  y: number;
  nodeTypes: readonly NodeTypeInfo[];
  /** Node types the graph can't have another of, like Component Input */
  unavailable: ReadonlySet<string>;
  /** The type of the output a wire is dragged from */
  from?: SocketType | undefined;
  onChoose: (choice: Choice) => void;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const [category, setCategory] = useState<string>();
  const query = search.trim().toLowerCase();

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [onClose]);

  const offered: Option[] = (
    from
      ? nodeTypes
          .filter((nodeType) => !unavailable.has(nodeType.type))
          .flatMap((nodeType) => inputFor(nodeType, from) ?? [])
      : nodeTypes.map((nodeType) => ({ nodeType }))
  ).filter((option) => option.nodeType.name.toLowerCase().includes(query));
  const categories = [
    ...new Set(nodeTypes.map((nodeType) => nodeType.category)),
  ];
  // Without a search or a wire, the menu shows categories first
  const browsing = from === undefined && query === "";
  const inCategory = offered.filter(
    (option) => option.nodeType.category === category,
  );
  const list = browsing ? (category ? inCategory : []) : offered;

  function move(by: number) {
    const length = browsing && !category ? categories.length : list.length;
    if (length > 0) {
      setActive((current) => (current + by + length) % length);
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (browsing && category) {
        setActive(categories.indexOf(category));
        setCategory(undefined);
      } else {
        onClose();
      }
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "ArrowRight" && browsing && !category) {
      event.preventDefault();
      setCategory(categories[active]);
      setActive(0);
    } else if (event.key === "ArrowLeft" && browsing && category) {
      event.preventDefault();
      setActive(categories.indexOf(category));
      setCategory(undefined);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (browsing && !category) {
        setCategory(categories[active]);
        setActive(0);
      } else {
        const chosen = list[active];
        if (chosen && !unavailable.has(chosen.nodeType.type)) {
          onChoose(chosen);
        }
      }
    }
  }

  return (
    <div
      ref={menu}
      role="menu"
      aria-label="Add node"
      style={{ left: x, top: y }}
      className="nopan nowheel absolute z-50 flex items-start gap-1"
    >
      {/* Categories are narrower than a list that names each node's category or input */}
      <div
        className={cn(
          "rounded-xl border border-foreground/10 bg-popover p-1 shadow-2xl",
          browsing ? "w-54" : "w-60",
        )}
      >
        <label className="mx-1 mb-1 flex h-8 items-center gap-2 rounded-md border border-selection/50 bg-card px-2">
          <Search className="size-3.5 shrink-0 text-subtle-foreground" />
          <input
            // biome-ignore lint/a11y/noAutofocus: the menu opens to search right away
            autoFocus
            aria-label="Search nodes"
            placeholder="Search nodes"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setActive(0);
              setCategory(undefined);
            }}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <div className="max-h-100 overflow-y-auto">
          {browsing ? (
            categories.map((name, index) => (
              <button
                key={name}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={category === name}
                onPointerEnter={() => {
                  setCategory(name);
                  setActive(0);
                }}
                onClick={() => setCategory(name)}
                className={cn(
                  ROW,
                  category === name || (!category && index === active)
                    ? "bg-highlight"
                    : "",
                )}
              >
                <span className="flex-1">{name}</span>
                <span className="text-subtle-foreground">
                  {
                    offered.filter((each) => each.nodeType.category === name)
                      .length
                  }
                </span>
                <ChevronRight className="size-3.5 text-subtle-foreground" />
              </button>
            ))
          ) : list.length === 0 ? (
            <p className="px-2 py-3 text-center text-muted-foreground text-sm">
              {from ? "No node takes this wire" : "No nodes found"}
            </p>
          ) : from ? (
            categories.map((name) => {
              const here = list.filter(
                (each) => each.nodeType.category === name,
              );
              return here.length === 0 ? null : (
                <div key={name}>
                  <p className="px-2 pt-1.25 pb-0.5 text-subtle-foreground text-xs">
                    {name}
                  </p>
                  {here.map((option) => (
                    <OptionRow
                      key={option.nodeType.type}
                      option={option}
                      query={query}
                      active={list.indexOf(option) === active}
                      disabled={unavailable.has(option.nodeType.type)}
                      showCategory={!browsing}
                      onActive={() => setActive(list.indexOf(option))}
                      onChoose={onChoose}
                    />
                  ))}
                </div>
              );
            })
          ) : (
            list.map((option, index) => (
              <OptionRow
                key={option.nodeType.type}
                option={option}
                query={query}
                active={index === active}
                disabled={unavailable.has(option.nodeType.type)}
                showCategory={!browsing}
                onActive={() => setActive(index)}
                onChoose={onChoose}
              />
            ))
          )}
        </div>
      </div>
      {browsing && category ? (
        <div
          role="menu"
          aria-label={category}
          className="w-54 rounded-xl border border-foreground/10 bg-popover p-1 shadow-2xl"
        >
          {inCategory.map((option, index) => (
            <OptionRow
              key={option.nodeType.type}
              option={option}
              query={query}
              active={index === active}
              disabled={unavailable.has(option.nodeType.type)}
              showCategory={!browsing}
              onActive={() => setActive(index)}
              onChoose={onChoose}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
