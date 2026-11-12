"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Prop } from "@/api/types.gen";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { SOCKET_COLOR } from "./accepts";
import { choiceOptions, inputsOf, useCanvas } from "./context";
import { ChoiceField, NumberField, TextField, Toggle } from "./fields";
import {
  addProp,
  changeProp,
  duplicateProp,
  expose,
  type GraphNode,
  PROP_NAME,
  removeProp,
  type SocketType,
  setProperty,
  setValue,
  unexpose,
} from "./graph";
import { TYPED } from "./node-view";
import { MENU_ITEM, MENU_SEPARATOR, PointerMenu } from "./pointer-menu";

const FIELD = "h-6.5";

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
        <span className="text-muted-foreground text-xs">
          {KINDS[type.kind ?? "any"]}
        </span>
      );
  }
}

/** A labelled row. Its menu, if it has one, opens on a right click. */
function Row({
  label,
  menu,
  active = false,
  children,
}: {
  label: string;
  menu?: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-menu={menu}
      className={cn(
        "-mx-1.5 flex h-8 items-center rounded-md px-1.5",
        active ? "bg-accent" : "",
      )}
    >
      <span className="w-21 shrink-0 truncate text-muted-foreground text-xs">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="border-border border-b px-3.5 pt-2.5 pb-3 last:border-b-0"
    >
      <h3 className="flex h-5 items-center font-semibold text-sm">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function Header({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex h-10.5 shrink-0 items-center border-border border-b px-3.5 font-semibold text-sm">
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

/** What the right column shows of the selected node: its value, properties, inputs and, for Component Input, the props. */
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
  const onNode = nodeType.properties.filter((property) => property.on_node);
  const properties = nodeType.properties.filter(
    (property) => !property.on_node && !node.exposed.includes(property.id),
  );
  // Inputs typed in a field: those without a wire, and every exposed property
  const inputs = inputsOf(canvas, node).filter(
    (input) =>
      node.exposed.includes(input.id) ||
      (TYPED.has(input.type.kind ?? "any") && !wired.has(input.id)),
  );
  const setOn = (property: string, key: string) => (value: unknown) =>
    canvas.edit(
      (graph) => setProperty(graph, id, property, value),
      `${key}:${id}:${property}`,
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

    const value =
      kind === "input"
        ? (node?.values[target] ??
          inputs.find((input) => input.id === target)?.default)
        : (node?.properties[target] ??
          nodeType?.properties.find((property) => property.id === target)
            ?.default);
    return (
      <>
        {kind === "property" ? (
          <DropdownMenuItem
            className={MENU_ITEM}
            onSelect={() => canvas.edit((graph) => expose(graph, id, target))}
          >
            Expose
          </DropdownMenuItem>
        ) : null}
        {kind === "exposed" ? (
          <DropdownMenuItem
            className={MENU_ITEM}
            onSelect={() => canvas.edit((graph) => unexpose(graph, id, target))}
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
      <Header>{nodeType.name}</Header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {onNode.length > 0 ? (
          <Section title="Output">
            {onNode.map((property) => {
              const value = node.properties[property.id] ?? property.default;
              const options =
                node.type === "choice" ? choiceOptions(canvas, id) : [];
              return (
                <Row key={property.id} label={property.label}>
                  {options.length > 0 ? (
                    <ChoiceField
                      label={property.label}
                      value={typeof value === "string" ? value : ""}
                      options={options}
                      className={FIELD}
                      onChange={setOn(property.id, "property")}
                    />
                  ) : (
                    <PanelField
                      label={property.label}
                      type={property.type}
                      value={value}
                      onChange={setOn(property.id, "property")}
                    />
                  )}
                </Row>
              );
            })}
          </Section>
        ) : null}
        {node.type === "component-input" ? (
          <Section title="Props">
            <Props open={open} onOpen={setOpen} menuOn={menu?.on} />
          </Section>
        ) : null}
        {properties.length > 0 ? (
          <Section title="Properties">
            {properties.map((property) => (
              <Row
                key={property.id}
                label={property.label}
                menu={`property:${property.id}`}
                active={menu?.on === `property:${property.id}`}
              >
                <PanelField
                  label={property.label}
                  type={property.type}
                  value={node.properties[property.id] ?? property.default}
                  onChange={setOn(property.id, "property")}
                />
              </Row>
            ))}
          </Section>
        ) : null}
        {inputs.length > 0 ? (
          <Section title="Inputs">
            {inputs.map((input) => {
              const exposed = node.exposed.includes(input.id);
              const key = `${exposed ? "exposed" : "input"}:${input.id}`;
              return (
                <Row
                  key={input.id}
                  label={input.label}
                  menu={key}
                  active={menu?.on === key}
                >
                  {wired.has(input.id) ? (
                    <span className="text-muted-foreground text-xs">Wired</span>
                  ) : (
                    <PanelField
                      label={input.label}
                      type={input.type}
                      value={
                        exposed
                          ? (node.properties[input.id] ?? input.default)
                          : (node.values[input.id] ?? input.default)
                      }
                      onChange={(value) =>
                        canvas.edit(
                          (graph) =>
                            exposed
                              ? setProperty(graph, id, input.id, value)
                              : setValue(graph, id, input.id, value),
                          `value:${id}:${input.id}`,
                        )
                      }
                    />
                  )}
                </Row>
              );
            })}
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
