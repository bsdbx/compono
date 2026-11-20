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
  const pixels = Number(width);
  const valid =
    name.trim() !== "" &&
    name.trim().length <= 30 &&
    !name.includes("\0") &&
    !taken.some((each) => each.toLowerCase() === name.trim().toLowerCase()) &&
    Number.isInteger(pixels) &&
    pixels >= 200 &&
    pixels <= 3840;
  const field =
    "flex h-7.5 w-full items-center rounded-md border border-input bg-card px-2 text-sm";
  return (
    <form
      className="flex flex-col gap-1.5 p-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onSave({ name: name.trim(), width: pixels });
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
      <Button type="submit" size="sm" disabled={!valid} className="w-full">
        {size ? "Save" : "Add"}
      </Button>
    </form>
  );
}

/** Named viewport widths, with the same actions for selected and unselected sizes. */
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
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<{
    size: ScreenSize;
    x: number;
    y: number;
  }>();
  const [editing, setEditing] = useState<ScreenSize>();
  const openingContext = useRef(false);

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
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setAdding(false);
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Screen size: ${current.name} ${current.width}`}
            className="flex h-7.5 min-w-0 items-center gap-1.5 rounded-md border border-border px-2 text-sm"
          >
            <SizeIcon width={current.width} />
            <span className="truncate">{current.name}</span>
            <span className="shrink-0 text-subtle-foreground">
              {current.width}
            </span>
            <ChevronDown className="ml-1 size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        {!menu ? (
          <DropdownMenuContent
            align="end"
            className="w-48"
            onCloseAutoFocus={(event) => {
              if (openingContext.current) {
                event.preventDefault();
                openingContext.current = false;
              }
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
                onContextMenu={(event) => {
                  event.preventDefault();
                  openingContext.current = true;
                  setOpen(false);
                  setMenu({ size, x: event.clientX, y: event.clientY });
                }}
              >
                <SizeIcon width={size.width} />
                <span>{size.name}</span>
                <span className="ml-auto text-subtle-foreground">
                  {size.width}
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
        ) : null}
      </DropdownMenu>
      {menu ? (
        <PointerMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(undefined)}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="w-36"
        >
          <DropdownMenuItem
            className="text-sm"
            onSelect={() => {
              setEditing(menu.size);
              setMenu(undefined);
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
                  size.width !== editing.width
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
