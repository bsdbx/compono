import { expect, test } from "vitest";
import type { Wire } from "@/api/types";
import { inputType } from "./context";
import { type Graph, newNode } from "./graph";
import {
  connectionEnds,
  flowHandle,
  graphHandle,
  groupDestination,
} from "./wiring";

const picked: Wire = {
  id: "wire",
  from: { node: "a", socket: "value" },
  to: { node: "b", socket: "value" },
};

test("occupied input drags move the existing wire's destination, including nodes with identical input and output IDs", () => {
  expect(
    connectionEnds(
      {
        source: "c",
        sourceHandle: flowHandle("target", "value"),
        target: "b",
        targetHandle: flowHandle("target", "value"),
      },
      picked,
    ),
  ).toEqual({ from: picked.from, to: { node: "c", socket: "value" } });
  expect(
    connectionEnds(
      {
        source: "c",
        sourceHandle: flowHandle("source", "value"),
        target: "b",
        targetHandle: flowHandle("target", "value"),
      },
      picked,
    ),
  ).toBeUndefined();
});

test("ordinary wiring keeps output and input directions explicit", () => {
  expect(
    connectionEnds({
      source: "a",
      sourceHandle: "source:value",
      target: "b",
      targetHandle: "target:value",
    }),
  ).toEqual({ from: picked.from, to: picked.to });
  expect(
    connectionEnds({
      source: "a",
      sourceHandle: "target:value",
      target: "b",
      targetHandle: "target:value",
    }),
  ).toBeUndefined();
  expect(graphHandle("source:children/r1")).toEqual({
    type: "source",
    socket: "children/r1",
  });
});

test("a filled shared-capsule entry appends, while empty entries and ordinary inputs keep their destination", () => {
  const graph: Graph = {
    format: 1,
    props: [],
    nodes: [
      {
        ...newNode("group", { x: 0, y: 0 }, "b"),
        groups: { children: ["r1", "empty"] },
      },
    ],
    wires: [{ ...picked, to: { node: "b", socket: "children/r1" } }],
  };
  expect(groupDestination(graph, { node: "b", socket: "children/r1" })).toEqual(
    { node: "b", socket: "children/+" },
  );
  expect(
    groupDestination(graph, { node: "b", socket: "children/empty" }),
  ).toEqual({ node: "b", socket: "children/empty" });
  expect(groupDestination(graph, picked.to)).toEqual(picked.to);
  const known = {
    evaluated: new Map(),
    nodeTypes: new Map([
      [
        "group",
        {
          type: "group",
          name: "Group",
          category: "Test",
          single: false,
          properties: [],
          sockets: {
            inputs: [],
            outputs: [],
            groups: [
              {
                id: "children",
                label: "Children",
                type: { kind: "text" as const },
                before: null,
              },
            ],
          },
        },
      ],
    ]),
  };
  expect(inputType(graph, known, "b", "children/+/r1")).toEqual({
    kind: "text",
  });
  expect(inputType(graph, known, "b", "children/+")).toEqual({ kind: "text" });
});
