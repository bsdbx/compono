import { render, screen } from "@testing-library/react";
import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BenchmarkNode, SimpleWhenZoomedOut } from "./benchmark-node";
import { benchmarkGraph } from "./graph";

const NODE_TYPES = { benchmark: BenchmarkNode };

beforeEach(() => {
  // React Flow watches the size of its nodes, which jsdom doesn't have
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The graph's first node, an Element with a select, an input and a field, at the zoom.
 * React Flow hides a node until it measures it, which jsdom can't, so inputs are found by their labels.
 */
function renderNode(zoom: number, simple: boolean) {
  const [element] = benchmarkGraph(1).nodes;
  render(
    <SimpleWhenZoomedOut value={simple}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={element === undefined ? [] : [element]}
          nodeTypes={NODE_TYPES}
          minZoom={0.05}
          defaultViewport={{ x: 0, y: 0, zoom }}
        />
      </ReactFlowProvider>
    </SimpleWhenZoomedOut>,
  );
}

test.each([
  { zoom: 1, simple: false },
  { zoom: 0.1, simple: false },
  { zoom: 1, simple: true },
  { zoom: 0.5, simple: true },
])(
  "a node at $zoom zoom, with simple $simple, shows everything",
  ({ zoom, simple }) => {
    renderNode(zoom, simple);

    expect(
      screen.getByText("Element", { selector: ".font-medium" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Tag")).toHaveValue("span");
    expect(screen.getByLabelText("Class name")).toHaveValue("badge");
    expect(document.querySelectorAll(".react-flow__handle")).toHaveLength(4);
  },
);

test("a simple node below 50% zoom leaves out its text and inputs, but keeps its sockets", () => {
  renderNode(0.49, true);

  expect(screen.queryByText("Element")).toBeNull();
  expect(screen.queryByText("Text")).toBeNull();
  expect(screen.queryByLabelText("Tag")).toBeNull();
  expect(screen.queryByLabelText("Class name")).toBeNull();
  expect(document.querySelectorAll(".react-flow__handle")).toHaveLength(4);
});
