import { GripVertical } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { InputSocket, NodeProperty, Prop } from "@/api/types";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { SOCKET_COLOR, socketTypeName } from "./accepts";
import {
  choiceOptions,
  defaultInputsOf,
  socketsOf,
  useCanvas,
} from "./context";
import { ChoiceField, NumberField, TextField, Toggle } from "./fields";
import {
  addProp,
  changeProp,
  duplicateProp,
  expose,
  type GraphNode,
  groupPropertyId,
  inPropertyOrder,
  PROP_NAME,
  placeRow,
  removeProp,
  renameSocket,
  reorderedRows,
  type SocketType,
  setProperty,
  setPropertyOrder,
  setValue,
  unexpose,
} from "./graph";
import { NodeNameInput } from "./node-name-input";
import { MENU_ITEM, MENU_SEPARATOR, PointerMenu } from "./pointer-menu";
import { useRowDrag } from "./use-row-drag";

const FIELD = "h-7 text-sm";

const KINDS: Readonly<Record<string, string>> = {
  text: "Text",
  number: "Number",
  boolean: "Boolean",
  choice: "Choice",
  date: "Date",
  object: "Object",
  element: "Element",
  slot: "Slot",
  nothing: "Nothing",
  any: "Any",
};

/** The kinds of prop a component can take, each as it starts. */
const PROP_TYPES: Readonly<Record<string, SocketType>> = {
  text: { kind: "text" },
  number: { kind: "number" },
  boolean: { kind: "boolean" },
  choice: { kind: "choice", options: [] },
  date: { kind: "date" },
};

/** A prop's type in a few words, like Number · Integer. */
function summary(type: SocketType): string {
  const kind = KINDS[type.kind ?? "any"] ?? "Any";
  if (type.kind === "text" && type.link) {
    return `${kind} · Link`;
  }

  if (type.kind === "number" && type.integer) {
    return `${kind} · Integer`;
  }

  return kind;
}

/** A field for a value of the type, with its label beside it rather than in it. */
function PanelField({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: SocketType;
  value: unknown;
  onChange: (value: unknown) => void;
}): ReactNode {
  switch (type.kind) {
    case "boolean":
      return (
        <Toggle label={label} value={value === true} onChange={onChange} />
      );
    case "number":
      return (
        <NumberField
          label={label}
          value={typeof value === "number" ? value : null}
          onChange={onChange}
          showLabel={false}
          className={FIELD}
        />
      );
    case "choice":
      return (
        <ChoiceField
          label={label}
          value={typeof value === "string" ? value : ""}
          options={type.options}
          onChange={onChange}
          className={FIELD}
        />
      );
    case "text":
    case "date":
      return (
        <TextField
          label={label}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
          showLabel={false}
          className={FIELD}
        />
      );
    default:
      return (
        <span className="text-muted-foreground text-sm">
          {KINDS[type.kind ?? "any"]}
        </span>
      );
  }
}

function ExposureAccent() {
  return (
    <span className="pointer-events-none absolute inset-y-0 left-0.5 my-auto h-3.5 w-0.5 rounded-full bg-socket-element">
      <span className="sr-only">Exposed</span>
    </span>
  );
}

function PropertyLabel({
  label,
  count,
}: {
  label: string;
  count?: number | undefined;
}) {
  return (
    <span title={label} className="flex min-w-0 items-baseline gap-1.5">
      <span className="truncate">{label}</span>
      {count !== undefined ? (
        <span className="shrink-0 text-subtle-foreground text-2xs">
          {count}
        </span>
      ) : null}
    </span>
  );
}

/** A labelled row. Its menu, if it has one, opens on a right click. */
function Row({
  label,
  count,
  menu,
  active = false,
  exposed = false,
  leading,
  onRename,
  children,
}: {
  label: string;
  count?: number | undefined;
  menu?: string | undefined;
  active?: boolean;
  exposed?: boolean | undefined;
  leading?: ReactNode;
  onRename?: ((name: string) => void) | undefined;
  children: ReactNode;
}) {
  const [renaming, setRenaming] = useState(false);

  return (
    <div
      data-menu={menu}
      data-row-drag-surface
      data-exposed={exposed ? "true" : undefined}
      className={cn(
        "relative flex h-8.5 items-center rounded-md px-1.5 transition-colors duration-100",
        !leading && "-mx-1.5",
        active ? "bg-highlight" : "hover:bg-highlight",
      )}
    >
      {exposed && <ExposureAccent />}
      {leading}
      {onRename ? (
        renaming ? (
          <NodeNameInput
            name={label}
            label="Child name"
            onSave={onRename}
            onDone={() => setRenaming(false)}
          />
        ) : (
          <button
            type="button"
            className="h-full min-w-0 flex-1 cursor-default truncate text-left text-muted-foreground text-sm"
            title={label}
            onDoubleClick={() => setRenaming(true)}
            onKeyDown={(event) => {
              if (event.key !== "F2" && event.key !== "Enter") return;
              event.preventDefault();
              event.stopPropagation();
              setRenaming(true);
            }}
          >
            {label}
          </button>
        )
      ) : (
        <>
          <span className="flex w-21 shrink-0 items-center text-muted-foreground text-sm">
            <PropertyLabel label={label} count={count} />
          </span>
          <div className="flex min-w-0 flex-1 items-center">{children}</div>
        </>
      )}
    </div>
  );
}

type PropertyRow = {
  id: string;
  label: string;
  count?: number;
  menu?: string;
  exposed?: boolean;
  field?: ReactNode;
  before?: string | null;
  details?: ReactNode;
  gripLabel?: string;
  onRename?: (name: string) => void;
};

function PropertyList({
  fields,
  activeMenu,
  onPlace,
  label = "Node property order",
  className,
}: {
  fields: readonly PropertyRow[];
  activeMenu?: string | undefined;
  onPlace: (row: string, before?: string) => void;
  label?: string;
  className?: string;
}) {
  const byId = new Map(fields.map((field) => [field.id, field]));
  const saved = fields.map((field) => field.id);
  const drag = useRowDrag(saved, onPlace);
  const preview = drag.preview;
  const dragged = preview && byId.get(preview.row);

  return (
    <div ref={drag.region} className={className} {...drag.handlers}>
      <ol
        ref={drag.list}
        aria-label={label}
        className="-mx-1.5 flex flex-col gap-1.5"
      >
        {drag.rows.map((id) => {
          const row = byId.get(id);
          if (!row) return null;
          return (
            <li
              key={id}
              data-row={id}
              className={cn(
                row.details &&
                  "rounded-md border border-node-group-border bg-node-group",
                preview?.row === id && "opacity-40",
              )}
            >
              <Row
                label={row.label}
                count={row.count}
                menu={row.menu}
                active={row.menu !== undefined && activeMenu === row.menu}
                exposed={row.exposed}
                onRename={row.onRename}
                leading={
                  <button
                    type="button"
                    aria-label={`Reorder ${row.gripLabel ?? row.label}`}
                    aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                    title="Drag to reorder (Alt+Up/Down)"
                    disabled={saved.length < 2}
                    className="mr-1 flex size-5 shrink-0 touch-none cursor-grab items-center justify-center rounded text-subtle-foreground hover:text-foreground active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
                    onPointerDown={(event) => {
                      const focused = document.activeElement;
                      if (
                        event.button === 0 &&
                        focused instanceof HTMLInputElement &&
                        drag.region.current?.contains(focused)
                      )
                        focused.blur();
                      drag.start(event, id);
                    }}
                    onKeyDown={(event) => {
                      const { key, altKey } = event;
                      if (!altKey || (key !== "ArrowUp" && key !== "ArrowDown"))
                        return;
                      event.preventDefault();
                      event.stopPropagation();
                      const index = saved.indexOf(id);
                      if (key === "ArrowUp" && index > 0)
                        onPlace(id, saved[index - 1]);
                      if (key === "ArrowDown" && index < saved.length - 1)
                        onPlace(id, saved[index + 2]);
                    }}
                  >
                    <GripVertical className="size-3.5" />
                  </button>
                }
              >
                {row.field}
              </Row>
              {row.details}
            </li>
          );
        })}
      </ol>
      {preview && dragged
        ? createPortal(
            <div
              aria-hidden
              data-property-drag-preview
              className="pointer-events-none fixed z-100 flex items-center gap-1 rounded-md border border-input bg-card px-1.5 text-foreground text-sm shadow-xl"
              style={{
                left: preview.x,
                top: preview.y,
                width: preview.width,
                height: preview.height,
              }}
            >
              {dragged.exposed && <ExposureAccent />}
              <span className="flex size-5 shrink-0 items-center justify-center">
                <GripVertical className="size-3.5" />
              </span>
              <PropertyLabel label={dragged.label} count={dragged.count} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="border-border border-b px-3.5 pt-2.5 pb-3 last:border-b-0"
    >
      <h3 className="flex h-5 items-center font-semibold text-base">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function Header({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex h-10.5 shrink-0 items-center border-border border-b px-3.5 font-semibold text-base">
      {children}
    </h2>
  );
}

/** The panel with no node to show, like before the canvas has loaded. */
export function PropertiesPlaceholder({ many = false }: { many?: boolean }) {
  return (
    <>
      <Header>Properties</Header>
      <p className="mt-10.25 text-center text-muted-foreground text-xs">
        {many
          ? "Select one node to edit its properties."
          : "Select a node to edit its properties."}
      </p>
    </>
  );
}

/** A prop's name, which only a name for React that no other prop has changes it to. */
function NameField({ prop }: { prop: Prop }) {
  const canvas = useCanvas();
  const [typed, setTyped] = useState<string>();
  const shown = typed ?? prop.name;
  const valid =
    PROP_NAME.test(shown) &&
    !canvas.graph.props.some(
      (other) => other.id !== prop.id && other.name === shown,
    );
  return (
    <TextField
      label="Name"
      value={shown}
      showLabel={false}
      className={cn(FIELD, valid ? "" : "border-error")}
      onChange={(name) => {
        setTyped(name);
        const free =
          PROP_NAME.test(name) &&
          !canvas.graph.props.some(
            (other) => other.id !== prop.id && other.name === name,
          );
        if (free) {
          canvas.edit(
            (graph) => changeProp(graph, prop.id, { name }),
            `prop:${prop.id}:name`,
          );
        }
      }}
      onBlur={() => setTyped(undefined)}
    />
  );
}

/** A Choice prop's options, typed with commas between them. */
function OptionsField({ prop, options }: { prop: Prop; options: string[] }) {
  const canvas = useCanvas();
  const [typed, setTyped] = useState<string>();
  return (
    <TextField
      label="Options"
      value={typed ?? options.join(", ")}
      showLabel={false}
      className={FIELD}
      onChange={(text) => {
        setTyped(text);
        const next = [
          ...new Set(
            text
              .split(",")
              .map((option) => option.trim())
              .filter(Boolean),
          ),
        ];
        canvas.edit(
          (graph) =>
            changeProp(graph, prop.id, {
              type: { kind: "choice", options: next },
              // A default that isn't an option any more is no default
              ...(typeof prop.default === "string" &&
              !next.includes(prop.default)
                ? { default: null }
                : {}),
            }),
          `prop:${prop.id}:options`,
        );
      }}
      onBlur={() => setTyped(undefined)}
    />
  );
}

function PropDetails({ prop }: { prop: Prop }) {
  const canvas = useCanvas();
  const type = prop.type as SocketType;
  const change = (field: string, values: Partial<Omit<Prop, "id">>) =>
    canvas.edit(
      (graph) => changeProp(graph, prop.id, values),
      `prop:${prop.id}:${field}`,
    );
  const number = type.kind === "number" ? type : undefined;
  const range = (bound: "minimum" | "maximum" | "step", label: string) => (
    <NumberField
      label={label}
      value={number?.[bound] ?? null}
      className={cn(FIELD, "min-w-0 flex-1")}
      onChange={(value) => {
        if (number && typeof value !== "string") {
          change(bound, { type: { ...number, [bound]: value ?? null } });
        }
      }}
    />
  );
  return (
    <div className="border-input border-b px-3.5 py-1">
      <Row label="Name">
        <NameField prop={prop} />
      </Row>
      <Row label="Type">
        <ChoiceField
          label="Type"
          value={type.kind ?? "any"}
          options={Object.keys(PROP_TYPES)}
          names={KINDS}
          className={FIELD}
          onChange={(kind) =>
            change("type", {
              type: PROP_TYPES[kind] ?? { kind: "text" },
              default: null,
            })
          }
        />
      </Row>
      {type.kind === "text" ? (
        <Row label="Subtype">
          <ChoiceField
            label="Subtype"
            value={type.link ? "link" : "plain"}
            options={["plain", "link"]}
            names={{ plain: "Plain", link: "Link" }}
            className={FIELD}
            onChange={(subtype) =>
              change("subtype", { type: { ...type, link: subtype === "link" } })
            }
          />
        </Row>
      ) : null}
      {number ? (
        <>
          <Row label="Subtype">
            <ChoiceField
              label="Subtype"
              value={number.integer ? "integer" : "decimal"}
              options={["decimal", "integer"]}
              names={{ decimal: "Decimal", integer: "Integer" }}
              className={FIELD}
              onChange={(subtype) =>
                change("subtype", {
                  type: { ...number, integer: subtype === "integer" },
                })
              }
            />
          </Row>
          <Row label="Range">
            <div className="flex min-w-0 flex-1 gap-1">
              {range("minimum", "Min")}
              {range("maximum", "Max")}
              {range("step", "Step")}
            </div>
          </Row>
        </>
      ) : null}
      {type.kind === "choice" ? (
        <Row label="Options">
          <OptionsField prop={prop} options={[...type.options]} />
        </Row>
      ) : null}
      <Row label="Required">
        <Toggle
          label="Required"
          value={prop.required === true}
          onChange={(required) => change("required", { required })}
        />
      </Row>
      <Row label="Default">
        <PanelField
          label="Default"
          type={
            type.kind === "choice"
              ? { ...type, options: ["", ...type.options] }
              : type
          }
          value={prop.default}
          onChange={(value) =>
            change("default", {
              default: value === "" ? null : (value ?? null),
            })
          }
        />
      </Row>
      <Row label="Description">
        <TextField
          label="Description"
          value={prop.description ?? ""}
          showLabel={false}
          className={FIELD}
          onChange={(description) => change("description", { description })}
        />
      </Row>
    </div>
  );
}

/** Component Input's props: each a row that opens to edit it, and one to add another. */
function Props({
  open,
  onOpen,
  menuOn,
}: {
  open: string | undefined;
  onOpen: (id: string | undefined) => void;
  menuOn: string | undefined;
}) {
  const canvas = useCanvas();
  return (
    <div className="mt-1 overflow-hidden rounded-lg border border-input">
      {canvas.graph.props.map((prop) => {
        const type = prop.type as SocketType;
        return (
          <div key={prop.id}>
            <button
              type="button"
              data-menu={`prop:${prop.id}`}
              aria-expanded={open === prop.id}
              onClick={() => onOpen(open === prop.id ? undefined : prop.id)}
              className={cn(
                "flex h-8 w-full items-center gap-2 border-input border-b px-3.5 text-left",
                menuOn === `prop:${prop.id}` ? "bg-accent" : "",
              )}
            >
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  SOCKET_COLOR[type.kind ?? "any"],
                )}
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {prop.name}
              </span>
              <span className="shrink-0 text-subtle-foreground text-xs">
                {summary(type)}
              </span>
            </button>
            {open === prop.id ? <PropDetails prop={prop} /> : null}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => {
          const id = crypto.randomUUID();
          canvas.edit((graph) => addProp(graph, id));
          onOpen(id);
        }}
        className="flex h-8 w-full items-center px-3.5 text-left text-muted-foreground text-sm hover:bg-accent"
      >
        Add prop
      </button>
    </div>
  );
}

/** The selected node's fields and, for Component Input, the component's public props. */
export function PropertiesPanel({ selected }: { selected: readonly string[] }) {
  const canvas = useCanvas();
  const toast = useToast();
  const root = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; on: string }>();
  const [open, setOpen] = useState<string>();

  // A right click on a row opens its menu
  useEffect(() => {
    const element = root.current;
    if (element === null) {
      return;
    }

    const onContextMenu = (event: MouseEvent) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-menu]",
      );
      if (row?.dataset.menu) {
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY, on: row.dataset.menu });
      }
    };
    // A right press on a field doesn't focus it, which would take the focus from its menu
    const onMouseDown = (event: MouseEvent) => {
      if (
        event.button === 2 &&
        (event.target as HTMLElement).closest("[data-menu]")
      ) {
        event.preventDefault();
      }
    };
    element.addEventListener("contextmenu", onContextMenu);
    element.addEventListener("mousedown", onMouseDown);
    return () => {
      element.removeEventListener("contextmenu", onContextMenu);
      element.removeEventListener("mousedown", onMouseDown);
    };
  }, []);

  const node: GraphNode | undefined =
    selected.length === 1
      ? canvas.graph.nodes.find((each) => each.id === selected[0])
      : undefined;
  const nodeType = node && canvas.nodeTypes.get(node.type);
  if (node === undefined || nodeType === undefined) {
    return (
      <div ref={root} className="flex min-h-0 flex-1 flex-col">
        <PropertiesPlaceholder many={selected.length > 1} />
      </div>
    );
  }

  const id = node.id;
  const wired = new Set(
    canvas.graph.wires
      .filter((wire) => wire.to.node === id && !canvas.refused.has(wire.id))
      .map((wire) => wire.to.socket),
  );
  const properties = nodeType.properties.toSorted(
    (a, b) => Number(b.on_node) - Number(a.on_node),
  );
  const defaults = defaultInputsOf(canvas, node);
  const groups = socketsOf(canvas, id, node.type).groups;
  const wiredLabel = (
    <span className="text-muted-foreground text-sm">Wired</span>
  );
  const setOn = (property: string) => (value: unknown) =>
    canvas.edit(
      (graph) => setProperty(graph, id, property, value),
      `property:${id}:${property}`,
    );

  function propertyField(property: NodeProperty) {
    const value = node?.properties[property.id] ?? property.default;
    const options =
      node?.type === "choice" && property.on_node
        ? choiceOptions(canvas, id)
        : [];
    if (options.length > 0) {
      return (
        <ChoiceField
          label={property.label}
          value={typeof value === "string" ? value : ""}
          options={options}
          className={FIELD}
          onChange={setOn(property.id)}
        />
      );
    }
    return (
      <PanelField
        label={property.label}
        type={property.type}
        value={value}
        onChange={setOn(property.id)}
      />
    );
  }

  function inputField(input: InputSocket) {
    return (
      <PanelField
        label={input.label}
        type={input.type}
        value={node?.values[input.id] ?? input.default}
        onChange={(value) =>
          canvas.edit(
            (graph) => setValue(graph, id, input.id, value),
            `value:${id}:${input.id}`,
          )
        }
      />
    );
  }

  const fields = inPropertyOrder<PropertyRow>(
    [
      ...properties.map((property) => {
        const exposed = node.exposed.includes(property.id);
        const inline =
          property.on_node && !node.unexposed?.includes(property.id);
        const kind = exposed
          ? "exposed"
          : inline
            ? "output-property"
            : "property";
        return {
          id: property.id,
          label: property.label,
          menu: `${kind}:${property.id}`,
          exposed,
          field:
            exposed && wired.has(property.id)
              ? wiredLabel
              : propertyField(property),
        };
      }),
      ...defaults.map((input) => {
        const exposed = !node.unexposed?.includes(input.id);
        return {
          id: input.id,
          label: input.label,
          menu: `${exposed ? "input" : "hidden-input"}:${input.id}`,
          exposed,
          field:
            exposed && wired.has(input.id) ? wiredLabel : inputField(input),
        };
      }),
      ...groups.map((group): PropertyRow => {
        const connected = (node.groups[group.id] ?? []).filter((row) =>
          wired.has(`${group.id}/${row}`),
        );
        const visible = new Set(connected);
        const typeLabel = socketTypeName(group.type);
        const children = connected.map(
          (row, index): PropertyRow => ({
            id: row,
            label: node.socketNames?.[`${group.id}/${row}`] ?? typeLabel,
            gripLabel: `${group.label} ${index + 1}`,
            onRename: (name) =>
              canvas.edit((graph) =>
                renameSocket(
                  graph,
                  id,
                  group.id,
                  row,
                  name === typeLabel ? "" : name,
                ),
              ),
          }),
        );
        return {
          id: groupPropertyId(group.id),
          before: group.before,
          label: group.label,
          count: children.length,
          details: children.length > 0 && (
            <PropertyList
              fields={children}
              label={`${group.label} order`}
              className="py-1 pr-2 pl-5 [&>ol]:gap-0.5"
              onPlace={(row, before) =>
                canvas.edit((graph) =>
                  placeRow(graph, id, group.id, row, before, visible),
                )
              }
            />
          ),
        };
      }),
    ],
    node.propertyOrder,
  );

  function copy(value: unknown) {
    const text =
      typeof value === "string" ? value : JSON.stringify(value ?? "");
    void navigator.clipboard?.writeText(text);
    toast({ title: "Value copied" });
  }

  function menuItems(on: string) {
    // Like property:title: what the row is, and its id
    const at = on.indexOf(":");
    const kind = on.slice(0, at);
    const target = on.slice(at + 1);
    if (kind === "prop") {
      return (
        <>
          <DropdownMenuItem
            className={MENU_ITEM}
            onSelect={() =>
              canvas.edit((graph) => duplicateProp(graph, target))
            }
          >
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator className={MENU_SEPARATOR} />
          <DropdownMenuItem
            variant="destructive"
            className={MENU_ITEM}
            onSelect={() => canvas.edit((graph) => removeProp(graph, target))}
          >
            Delete
          </DropdownMenuItem>
        </>
      );
    }

    const defaultInput = kind === "input" || kind === "hidden-input";
    const property = nodeType?.properties.find(
      (property) => property.id === target,
    );
    const origin = defaultInput
      ? "input"
      : property?.on_node
        ? "output-property"
        : "property";
    const value = defaultInput
      ? (node?.values[target] ??
        defaults.find((input) => input.id === target)?.default)
      : (node?.properties[target] ?? property?.default);
    return (
      <>
        {kind === "property" ||
        kind === "hidden-input" ||
        kind === "output-property" ? (
          <DropdownMenuItem
            className={MENU_ITEM}
            onSelect={() =>
              canvas.edit((graph) => expose(graph, id, target, origin))
            }
          >
            Expose
          </DropdownMenuItem>
        ) : null}
        {kind === "exposed" ||
        kind === "input" ||
        kind === "output-property" ? (
          <DropdownMenuItem
            className={MENU_ITEM}
            onSelect={() =>
              canvas.edit((graph) => unexpose(graph, id, target, origin))
            }
          >
            Unexpose
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem className={MENU_ITEM} onSelect={() => copy(value)}>
          Copy value
        </DropdownMenuItem>
      </>
    );
  }

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col">
      <Header>
        <span className="truncate" title={node.name ?? nodeType.name}>
          {node.name ?? nodeType.name}
        </span>
      </Header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {node.type === "component-input" ? (
          <Section title="Props">
            <Props open={open} onOpen={setOpen} menuOn={menu?.on} />
          </Section>
        ) : null}
        {fields.length > 0 ? (
          <Section title="Properties">
            <PropertyList
              key={id}
              fields={fields}
              activeMenu={menu?.on}
              onPlace={(row, before) => {
                const saved = fields.map((field) => field.id);
                const order = reorderedRows(saved, row, before);
                if (order !== saved)
                  canvas.edit((graph) => setPropertyOrder(graph, id, order));
              }}
            />
          </Section>
        ) : null}
      </div>
      {menu ? (
        <PointerMenu x={menu.x} y={menu.y} onClose={() => setMenu(undefined)}>
          {menuItems(menu.on)}
        </PointerMenu>
      ) : null}
    </div>
  );
}
