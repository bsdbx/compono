import type { SocketType } from "./graph";

/** Whether a wire may run from an output of the type `out` into an input of the type `into`, as the API decides. */
export function accepts(into: SocketType, out: SocketType): boolean {
  // Any takes everything, and Nothing counts as no wire. An output still Any isn't known yet, so it's let through
  if (into.kind === "any" || out.kind === "nothing" || out.kind === "any") {
    return true;
  }
  switch (into.kind) {
    case "slot":
      return out.kind === "element";
    case "number":
      return out.kind === "number" && (Boolean(out.integer) || !into.integer);
    case "text":
      return out.kind === "text" && (Boolean(out.link) || !into.link);
    case "choice":
      return (
        out.kind === "choice" &&
        out.options.every((option) => into.options.includes(option))
      );
    case "object":
      return (
        out.kind === "object" &&
        Object.entries(into.fields).every(
          ([name, field]) =>
            Object.hasOwn(out.fields, name) &&
            accepts(field, out.fields[name] as SocketType),
        )
      );
    default:
      return into.kind === out.kind;
  }
}

/** The color of a socket and its wires, by type. */
type Kind = NonNullable<SocketType["kind"]>;

const SOCKET_NAMES: Record<Kind, string> = {
  boolean: "Boolean",
  number: "Number",
  text: "Text",
  choice: "Choice",
  object: "Object",
  date: "Date",
  element: "Element",
  slot: "Element",
  nothing: "Nothing",
  any: "Any",
};

/** A group's entries are named for the accepted type, independently of their connected values. */
export function socketTypeName(type: SocketType): string {
  return SOCKET_NAMES[type.kind ?? "any"];
}

export const SOCKET_COLOR: Record<Kind, string> = {
  boolean: "bg-socket-boolean",
  number: "bg-socket-number",
  text: "bg-socket-text",
  choice: "bg-socket-choice",
  object: "bg-socket-object",
  date: "bg-socket-date",
  element: "bg-socket-element",
  slot: "bg-socket-element",
  nothing: "bg-socket-nothing",
  any: "bg-socket-any",
};

/** The same colors, for wires drawn in SVG. */
export const WIRE_COLOR: Record<Kind, string> = {
  boolean: "var(--socket-boolean)",
  number: "var(--socket-number)",
  text: "var(--socket-text)",
  choice: "var(--socket-choice)",
  object: "var(--socket-object)",
  date: "var(--socket-date)",
  element: "var(--socket-element)",
  slot: "var(--socket-element)",
  nothing: "var(--socket-nothing)",
  any: "var(--socket-any)",
};
