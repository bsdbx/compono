import { ChevronRight, GripVertical, Plus } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { InputSocket, NodeProperty, Prop } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { groupItemLabel } from "./accepts";
import { type ChoiceMenu, choiceMenuOf } from "./choice-menus";
import { defaultInputsOf, socketsOf, useCanvas, wiredChoices } from "./context";
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
  placeObjectField,
  placeProp,
  placeRow,
  removeObjectField,
  removeProp,
  renameObjectField,
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
const ROW_STYLE =
  "flex h-8.5 items-center rounded-md px-1.5 transition-colors duration-100";

const FIELD_HINTS: Readonly<Record<string, Readonly<Record<string, string>>>> =
  {
    element: {
      id: "Unique ID",
      key: "React key",
      title: "Tooltip text",
      tabindex: "Tab order",
      lang: "Language code",
      text: "Visible text",
      class: "Tailwind classes",
      href: "Link destination",
      src: "Image URL",
      alt: "Image description",
    },
    fragment: { key: "React key" },
    text: { value: "Hello" },
    number: { value: "0" },
    choice: { value: "Option value" },
    switch: { true: "When true", false: "When false" },
    compare: { a: "Value to compare", b: "Compare against" },
    default: { fallback: "Default value" },
    join: { separator: "Between items" },
    "text-length": { text: "Text to measure" },
  };

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
  placeholder,
  menu,
  onChange,
}: {
  label: string;
  type: SocketType;
  value: unknown;
  placeholder?: string | undefined;
  menu?: ChoiceMenu | undefined;
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
          placeholder={placeholder}
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
          menu={menu}
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
          placeholder={placeholder}
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

function ExposureAccent({ boxed = false }: { boxed?: boolean }) {
  return (
    <>
      <span className="sr-only">Exposed</span>
      {!boxed && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0.5 my-auto h-3.5 w-0.5 rounded-full bg-socket-element"
        />
      )}
    </>
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
  boxed = false,
  leading,
  onRename,
  renameLabel = "Child name",
  validateName,
  children,
}: {
  label: string;
  count?: number | undefined;
  menu?: string | undefined;
  active?: boolean;
  exposed?: boolean | undefined;
  boxed?: boolean;
  leading?: ReactNode;
  onRename?: ((name: string) => void) | undefined;
  renameLabel?: string | undefined;
  validateName?: ((name: string) => boolean) | undefined;
  children: ReactNode;
}) {
  const [renaming, setRenaming] = useState(false);

  return (
    <div
      data-menu={menu}
      data-row-drag-surface
      data-exposed={exposed ? "true" : undefined}
      className={cn(
        ROW_STYLE,
        "relative",
        !leading && "-mx-1.5",
        active ? "bg-highlight" : "hover:bg-highlight",
      )}
    >
      {exposed && <ExposureAccent boxed={boxed} />}
      {leading}
      {onRename ? (
        renaming ? (
          <NodeNameInput
            name={label}
            label={renameLabel}
            onSave={onRename}
            onDone={() => setRenaming(false)}
            {...(validateName && { validate: validateName })}
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
      {onRename && children && (
        <div className="ml-1.5 w-26 max-w-1/2 shrink-0">{children}</div>
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
  renameLabel?: string;
  validateName?: (name: string) => boolean;
  renderHeader?: (grip: ReactNode) => ReactNode;
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
  const draggedBoxed = Boolean(dragged?.details);

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
          const boxed = Boolean(row.details);
          const grip = (
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
          );
          return (
            <li
              key={id}
              data-row={id}
              className={cn(
                boxed && "rounded-md border bg-node-group",
                boxed &&
                  (row.exposed
                    ? "border-socket-element/40"
                    : "border-node-group-border"),
                preview?.row === id && "opacity-40",
              )}
            >
              {row.renderHeader ? (
                row.renderHeader(grip)
              ) : (
                <Row
                  label={row.label}
                  count={row.count}
                  menu={row.menu}
                  active={row.menu !== undefined && activeMenu === row.menu}
                  exposed={row.exposed}
                  boxed={boxed}
                  onRename={row.onRename}
                  renameLabel={row.renameLabel}
                  validateName={row.validateName}
                  leading={grip}
                >
                  {row.field}
                </Row>
              )}
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
              className={cn(
                "pointer-events-none fixed z-100 flex items-center gap-1 rounded-md border bg-card px-1.5 text-foreground text-sm shadow-xl",
                dragged.exposed && draggedBoxed
                  ? "border-socket-element/40"
                  : "border-input",
              )}
              style={{
                left: preview.x,
                top: preview.y,
                width: preview.width,
                height: preview.height,
              }}
            >
              {dragged.exposed && <ExposureAccent boxed={draggedBoxed} />}
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

function PropertiesHeading() {
  return (
    <h2 className="flex h-10.5 shrink-0 items-center border-border border-b px-3.5 font-semibold text-base">
      Properties
    </h2>
  );
}

/** The panel with no node to show, like before the canvas has loaded. */
export function PropertiesPlaceholder({ many = false }: { many?: boolean }) {
  return (
    <>
      <PropertiesHeading />
      <p className="mt-10.25 px-3.5 text-center text-muted-foreground text-base">
        {many
          ? "Select one node to edit its properties."
          : "Select a node to edit its properties."}
      </p>
    </>
  );
}

/** Choice options, typed with commas between them. */
function OptionsField({
  options,
  onChange,
}: {
  options: readonly string[];
  onChange: (options: string[]) => void;
}) {
  const [typed, setTyped] = useState<string>();
  return (
    <TextField
      label="Options"
      value={typed ?? options.join(", ")}
      placeholder="Small, Large"
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
        onChange(next);
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
    <Row label={label}>
      <NumberField
        label={label}
        value={number?.[bound] ?? null}
        placeholder="–"
        showLabel={false}
        className={FIELD}
        onChange={(value) => {
          if (number && typeof value !== "string") {
            change(bound, { type: { ...number, [bound]: value ?? null } });
          }
        }}
      />
    </Row>
  );
  return (
    <div className="px-2.5 pt-0.5 pb-2">
      <Row label="Type">
        <ChoiceField
          label="Type"
          value={type.kind ?? "any"}
          options={Object.keys(PROP_TYPES)}
          names={KINDS}
          menu={{ search: "Search types" }}
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
          {range("minimum", "Min")}
          {range("maximum", "Max")}
          {range("step", "Step")}
        </>
      ) : null}
      {type.kind === "choice" ? (
        <Row label="Options">
          <OptionsField
            options={type.options}
            onChange={(options) =>
              change("options", {
                type: { kind: "choice", options },
                ...(typeof prop.default === "string" &&
                !options.includes(prop.default)
                  ? { default: null }
                  : {}),
              })
            }
          />
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
          placeholder="Unset"
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
          placeholder="Usage notes"
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
  const [renaming, setRenaming] = useState<string>();
  const fields = canvas.graph.props.map((prop): PropertyRow => {
    const type = prop.type as SocketType;
    const expanded = open === prop.id;
    const menuKey = `prop:${prop.id}`;
    const action = expanded ? "Collapse" : "Expand";
    const rename = () => setRenaming(prop.id);
    const nameAvailable = (name: string, graph = canvas.graph) =>
      PROP_NAME.test(name) &&
      !graph.props.some((other) => other.id !== prop.id && other.name === name);
    return {
      id: prop.id,
      label: prop.name,
      details: expanded && <PropDetails prop={prop} />,
      renderHeader: (grip) => (
        <div
          data-row-drag-surface
          data-menu={menuKey}
          className={cn(
            ROW_STYLE,
            "pr-2.5",
            menuOn === menuKey ? "bg-highlight" : "hover:bg-highlight",
          )}
        >
          {grip}
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              {renaming === prop.id ? (
                <NodeNameInput
                  name={prop.name}
                  label="Prop name"
                  className="field-sizing-content h-5.5 min-w-4 flex-initial leading-5.5"
                  validate={nameAvailable}
                  onSave={(name) =>
                    canvas.edit((graph) => {
                      const current = graph.props.find(
                        (entry) => entry.id === prop.id,
                      );
                      return current &&
                        name !== current.name &&
                        nameAvailable(name, graph)
                        ? changeProp(graph, prop.id, { name })
                        : graph;
                    })
                  }
                  onDone={() => setRenaming(undefined)}
                />
              ) : (
                <button
                  type="button"
                  aria-label={`Rename ${prop.name}`}
                  title={`${prop.name} · Double-click to rename`}
                  className="h-5.5 min-w-0 cursor-text truncate rounded-sm text-left text-sm leading-5.5"
                  onDoubleClick={rename}
                  onClick={(event) => {
                    if (event.detail === 0) rename();
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "F2") return;
                    event.preventDefault();
                    event.stopPropagation();
                    rename();
                  }}
                >
                  {prop.name}
                </button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-5.5 cursor-pointer hover:bg-foreground/10 active:bg-foreground/16 aria-expanded:text-foreground"
                aria-label={`${action} ${prop.name} settings`}
                title={`${action} settings`}
                aria-expanded={expanded}
                onClick={() => onOpen(expanded ? undefined : prop.id)}
              >
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "size-3.5 transition-transform duration-150",
                    expanded && "rotate-90",
                  )}
                />
              </Button>
            </div>
            <span className="shrink-0 text-subtle-foreground text-xs leading-5.5">
              {summary(type)}
            </span>
          </div>
        </div>
      ),
    };
  });

  return (
    <div className="flex flex-col gap-1.5">
      {fields.length > 0 && (
        <PropertyList
          fields={fields}
          label="Component prop order"
          onPlace={(row, before) =>
            canvas.edit((graph) => placeProp(graph, row, before))
          }
        />
      )}
      <button
        type="button"
        onClick={() => {
          const id = crypto.randomUUID();
          canvas.edit((graph) => addProp(graph, id));
          onOpen(id);
        }}
        className={cn(
          ROW_STYLE,
          "-mx-1.5 gap-2 text-left text-muted-foreground text-sm hover:bg-highlight hover:text-foreground",
        )}
      >
        <Plus aria-hidden className="size-3.5 shrink-0" />
        Add prop
      </button>
    </div>
  );
}

function ObjectFields({
  node,
  menuOn,
}: {
  node: GraphNode;
  menuOn: string | undefined;
}) {
  const canvas = useCanvas();
  const entries = node.fields ?? [];
  const sockets = canvas.evaluated.get(node.id)?.sockets.inputs;
  const fields = entries.map((field): PropertyRow => {
    const type =
      sockets?.find((socket) => socket.id === field.id)?.type ?? field.type;
    const typeName =
      type.kind === "number"
        ? type.integer
          ? "Integer"
          : "Decimal"
        : type.kind === "text" && type.link
          ? "Link"
          : (KINDS[type.kind ?? "any"] ?? "Any");
    return {
      id: field.id,
      label: field.name,
      menu: `object-field:${field.id}`,
      renameLabel: "Field name",
      validateName: (name) =>
        Boolean(name.trim()) &&
        !entries.some(
          (other) => other.id !== field.id && other.name === name.trim(),
        ),
      onRename: (name) =>
        canvas.edit((graph) =>
          renameObjectField(graph, node.id, field.id, name),
        ),
      field: (
        <span className="block truncate text-right text-subtle-foreground text-xs">
          {typeName}
        </span>
      ),
    };
  });
  return (
    <PropertyList
      fields={fields}
      activeMenu={menuOn}
      label="Object field order"
      onPlace={(row, before) =>
        canvas.edit((graph) => placeObjectField(graph, node.id, row, before))
      }
    />
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
  const incoming = canvas.graph.wires.filter((wire) => wire.to.node === id);
  const wired = new Set(incoming.map((wire) => wire.to.socket));
  const accepted = new Set(
    incoming
      .filter((wire) => !canvas.refused.has(wire.id))
      .map((wire) => wire.to.socket),
  );
  const properties = nodeType.properties.toSorted(
    (a, b) => Number(b.on_node) - Number(a.on_node),
  );
  const hints = FIELD_HINTS[node.type];
  const defaults = node.type === "object" ? [] : defaultInputsOf(canvas, node);
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
    const choices =
      node?.type === "choice" && property.on_node
        ? wiredChoices(canvas, id)
        : undefined;
    if (choices && choices.options.length > 0) {
      return (
        <ChoiceField
          label={property.label}
          value={typeof value === "string" ? value : ""}
          options={choices.options}
          menu={choices.menu}
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
        menu={node && choiceMenuOf(node.type, property.id)}
        placeholder={
          node?.type === "text" &&
          property.id === "value" &&
          node.properties.subtype === "Link"
            ? "Link destination"
            : hints?.[property.id]
        }
        onChange={setOn(property.id)}
      />
    );
  }

  function inputField(input: InputSocket) {
    if (input.wire_only) return null;
    return (
      <PanelField
        label={input.label}
        type={input.type}
        value={node?.values[input.id] ?? input.default}
        menu={node && choiceMenuOf(node.type, input.id)}
        placeholder={hints?.[input.id]}
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
        const kind = exposed ? "exposed" : "property";
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
        const propertyId = groupPropertyId(group.id);
        const exposed = !node.unexposed?.includes(propertyId);
        const editable = group.type.kind === "text";
        const items = (node.groups[group.id] ?? []).filter(
          (row) => editable || (exposed && accepted.has(`${group.id}/${row}`)),
        );
        const visible = new Set(items);
        const itemFields = items.map((row, index): PropertyRow => {
          const socket = `${group.id}/${row}`;
          const defaultLabel = groupItemLabel(group, index);
          const label = node.socketNames?.[socket] ?? defaultLabel;
          return {
            id: row,
            label,
            gripLabel: `${group.item_label ?? group.label} ${index + 1}`,
            ...(group.item_label
              ? { renameLabel: `${group.item_label} name` }
              : {}),
            field: editable
              ? exposed && wired.has(socket)
                ? wiredLabel
                : inputField({
                    id: socket,
                    label,
                    type: group.type,
                    default: "",
                  })
              : null,
            onRename: (name) =>
              canvas.edit((graph) =>
                renameSocket(
                  graph,
                  id,
                  group.id,
                  row,
                  name === defaultLabel ? "" : name,
                ),
              ),
          };
        });
        return {
          id: propertyId,
          before: group.before,
          label: group.label,
          menu: `${exposed ? "group" : "hidden-group"}:${group.id}`,
          exposed,
          count: itemFields.length,
          details: itemFields.length > 0 && (
            <PropertyList
              fields={itemFields}
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
    if (kind === "object-field") {
      return (
        <DropdownMenuItem
          className={MENU_ITEM}
          variant="destructive"
          onSelect={() =>
            canvas.edit((graph) => removeObjectField(graph, id, target))
          }
        >
          Delete
        </DropdownMenuItem>
      );
    }
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
    const group = kind === "group" || kind === "hidden-group";
    const property = nodeType?.properties.find(
      (property) => property.id === target,
    );
    const origin = group ? "group" : defaultInput ? "input" : "property";
    const value = defaultInput
      ? (node?.values[target] ??
        defaults.find((input) => input.id === target)?.default)
      : (node?.properties[target] ?? property?.default);
    return (
      <>
        {kind === "property" ||
        kind === "hidden-input" ||
        kind === "hidden-group" ? (
          <DropdownMenuItem
            className={MENU_ITEM}
            onSelect={() =>
              canvas.edit((graph) => expose(graph, id, target, origin))
            }
          >
            Expose
          </DropdownMenuItem>
        ) : null}
        {kind === "exposed" || kind === "input" || kind === "group" ? (
          <DropdownMenuItem
            className={MENU_ITEM}
            onSelect={() =>
              canvas.edit((graph) => unexpose(graph, id, target, origin))
            }
          >
            Unexpose
          </DropdownMenuItem>
        ) : null}
        {group ? null : (
          <DropdownMenuItem className={MENU_ITEM} onSelect={() => copy(value)}>
            Copy value
          </DropdownMenuItem>
        )}
      </>
    );
  }

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col">
      <PropertiesHeading />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {node.type === "component-input" ? (
          <section aria-label="Props" className="px-3.5 pt-3.5 pb-3">
            <Props open={open} onOpen={setOpen} menuOn={menu?.on} />
          </section>
        ) : null}
        {node.type === "object" && (
          <section aria-label="Object fields" className="px-3.5 pt-3.5 pb-3">
            <ObjectFields key={id} node={node} menuOn={menu?.on} />
          </section>
        )}
        {fields.length > 0 ? (
          <section aria-label="Properties" className="px-3.5 pt-2.5 pb-3">
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
          </section>
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
