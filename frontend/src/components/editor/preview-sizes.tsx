import { ChevronDown, Monitor, Plus, Smartphone, Tablet } from "lucide-react";
import { useRef, useState } from "react";
import type { ScreenSize } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PointerMenu } from "@/components/ui/pointer-menu";
import { cn } from "@/lib/utils";
import { screenHeight } from "./preview-size";

function SizeIcon({ width }: { width: number }) {
  const Icon = width >= 1024 ? Monitor : width >= 600 ? Tablet : Smartphone;
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" />;
}

function SizeForm({
  taken,
  size,
  onSave,
}: {
  taken: readonly string[];
  size?: ScreenSize;
  onSave: (size: ScreenSize) => void;
}) {
  const [name, setName] = useState(size?.name ?? "");
  const [width, setWidth] = useState(size ? String(size.width) : "");
  const [height, setHeight] = useState(String(size ? screenHeight(size) : 720));
  const pixels = Number(width);
  const rows = Number(height);
  const valid =
    name.trim() !== "" &&
    name.trim().length <= 30 &&
    !name.includes("\0") &&
    !taken.some((each) => each.toLowerCase() === name.trim().toLowerCase()) &&
    Number.isInteger(pixels) &&
    pixels >= 200 &&
    pixels <= 3840 &&
    Number.isInteger(rows) &&
    rows >= 200 &&
    rows <= 3840;
  const field =
    "flex h-7.5 w-full items-center rounded-md border border-input bg-card px-2 text-sm";
  return (
    <form
      className="flex flex-col gap-1.5 p-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onSave({ name: name.trim(), width: pixels, height: rows });
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") event.stopPropagation();
      }}
    >
      <input
        // biome-ignore lint/a11y/noAutofocus: the user opens the form to type the name
        autoFocus
        aria-label="Size name"
        placeholder="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className={cn(field, "outline-none focus:border-selection/50")}
      />
      <label className={cn(field, "gap-1 focus-within:border-selection/50")}>
        <input
          aria-label="Width"
          inputMode="numeric"
          placeholder="Width"
          value={width}
          onChange={(event) => setWidth(event.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
        <span className="text-subtle-foreground">px</span>
      </label>
      <label className={cn(field, "gap-1 focus-within:border-selection/50")}>
        <input
          aria-label="Height"
          inputMode="numeric"
          placeholder="Height"
          value={height}
          onChange={(event) => setHeight(event.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
        <span className="text-subtle-foreground">px</span>
      </label>
      <Button type="submit" size="sm" disabled={!valid} className="w-full">
        {size ? "Save" : "Add"}
      </Button>
    </form>
  );
}

/** Named screen sizes, with the same actions for selected and unselected sizes. */
export function SizePicker({
  sizes,
  current,
  onPick,
  onChange,
}: {
  sizes: readonly ScreenSize[];
  current: ScreenSize;
  onPick: (size: ScreenSize) => void;
  onChange: (sizes: ScreenSize[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const isOpen = useRef(open);
  isOpen.current = open;
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<{
    size: ScreenSize;
    x: number;
    y: number;
  }>();
  const [editing, setEditing] = useState<ScreenSize>();
  const openingDialog = useRef(false);
  const row = useRef<HTMLElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);

  function remove(size: ScreenSize) {
    if (sizes.length <= 1) return;
    const index = sizes.findIndex((each) => each.name === size.name);
    if (index < 0) return;
    const next = sizes.filter((each) => each.name !== size.name);
    onChange(next);
    if (current.name === size.name) {
      const replacement = next[Math.min(index, next.length - 1)];
      if (replacement) onPick(replacement);
    }
  }

  return (
    <>
      <DropdownMenu
        modal={false}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setAdding(false);
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Screen size: ${current.name} ${current.width} × ${screenHeight(current)}`}
            title={`${current.name} ${current.width} × ${screenHeight(current)}`}
            className="flex h-7.5 min-w-0 items-center gap-1 rounded-md border border-border px-1.5 text-sm"
          >
            <SizeIcon width={current.width} />
            <span className="truncate">{current.name}</span>
            <span className="shrink-0 text-subtle-foreground">
              {current.width} × {screenHeight(current)}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          ref={list}
          align="end"
          aria-label="Screen sizes"
          aria-labelledby={undefined}
          data-preview-controls
          className="min-w-0"
          onInteractOutside={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest(".preview-size-actions")
            )
              event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            if (openingDialog.current) {
              event.preventDefault();
              openingDialog.current = false;
            } else if (isOpen.current) event.preventDefault();
          }}
        >
          {sizes.map((size) => (
            <DropdownMenuItem
              key={size.name}
              aria-current={size.name === current.name ? "true" : undefined}
              className={cn(
                "h-8 gap-2 text-sm",
                size.name === current.name && "bg-accent",
              )}
              onSelect={() => onPick(size)}
              onPointerLeave={(event) => {
                // Opening the action menu moves the pointer off its row.
                if (menu) event.preventDefault();
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                row.current = event.currentTarget;
                setMenu({ size, x: event.clientX, y: event.clientY });
              }}
            >
              <SizeIcon width={size.width} />
              <span className="min-w-0 truncate">{size.name}</span>
              <span className="ml-auto shrink-0 text-subtle-foreground">
                {size.width} × {screenHeight(size)}
              </span>
            </DropdownMenuItem>
          ))}
          {sizes.length < 10 ? (
            <>
              <DropdownMenuSeparator />
              {adding ? (
                <SizeForm
                  taken={sizes.map((size) => size.name)}
                  onSave={(size) => {
                    onChange([...sizes, size]);
                    onPick(size);
                    setOpen(false);
                    setAdding(false);
                  }}
                />
              ) : (
                <DropdownMenuItem
                  className="h-8 gap-2 text-sm"
                  onSelect={(event) => {
                    event.preventDefault();
                    setAdding(true);
                  }}
                >
                  <Plus className="size-3.5 text-muted-foreground" />
                  Add size
                </DropdownMenuItem>
              )}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {menu ? (
        <PointerMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(undefined)}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (openingDialog.current) return;
            const active = document.activeElement;
            if (
              active instanceof HTMLElement &&
              active !== document.body &&
              !active.closest(".preview-size-actions")
            )
              return;
            (row.current?.isConnected ? row.current : list.current)?.focus({
              preventScroll: true,
            });
          }}
          className="preview-size-actions w-36"
        >
          <DropdownMenuItem
            className="text-sm"
            onSelect={() => {
              openingDialog.current = true;
              setEditing(menu.size);
              setMenu(undefined);
              setOpen(false);
            }}
          >
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-sm"
            variant="destructive"
            disabled={sizes.length <= 1}
            onSelect={() => {
              remove(menu.size);
              setMenu(undefined);
            }}
          >
            Delete
          </DropdownMenuItem>
        </PointerMenu>
      ) : null}
      {editing ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setEditing(undefined);
          }}
        >
          <DialogContent className="gap-3" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Edit preview size</DialogTitle>
            </DialogHeader>
            <SizeForm
              size={editing}
              taken={sizes
                .filter((size) => size.name !== editing.name)
                .map((size) => size.name)}
              onSave={(size) => {
                if (
                  size.name !== editing.name ||
                  size.width !== editing.width ||
                  screenHeight(size) !== screenHeight(editing)
                ) {
                  onChange(
                    sizes.map((each) =>
                      each.name === editing.name ? size : each,
                    ),
                  );
                  if (current.name === editing.name) onPick(size);
                }
                setEditing(undefined);
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
