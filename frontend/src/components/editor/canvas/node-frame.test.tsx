import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { CanvasContext, type CanvasState } from "./context";
import { type Graph, newNode } from "./graph";
import { NodeFrame } from "./node-frame";

// Width editing is tested through the canvas; this isolates entering inline rename.
vi.mock("./node-width-control", () => ({ NodeWidthControl: () => null }));

test("starting rename preserves the chosen width, even when the full label is wider", () => {
  const measure = vi
    .spyOn(HTMLElement.prototype, "scrollWidth", "get")
    .mockReturnValue(240);
  try {
    const node = {
      ...newNode("text", { x: 0, y: 0 }, "title"),
      name: "A long title",
      width: 168,
    };
    const graph: Graph = { format: 1, props: [], nodes: [node], wires: [] };
    const canvas: CanvasState = {
      graph,
      nodeTypes: new Map(),
      evaluated: new Map(),
      refused: new Set(),
      edit: () => {},
      openMenu: () => {},
      renaming: undefined,
      startRename: () => {},
      finishRename: () => {},
      resizeNode: () => {},
    };
    const view = (renaming: string | undefined) => (
      <CanvasContext value={{ ...canvas, renaming }}>
        <NodeFrame
          node={node}
          typeName="Text"
          selected
          error={false}
          skipped={false}
        >
          Body
        </NodeFrame>
      </CanvasContext>
    );
    const { rerender } = render(view(undefined));
    expect(document.querySelector('[data-node-type="text"]')).toHaveStyle({
      width: "168px",
    });
    rerender(view(node.id));
    expect(screen.getByRole("textbox", { name: "Node name" })).toHaveFocus();
    expect(document.querySelector('[data-node-type="text"]')).toHaveStyle({
      width: "168px",
    });
  } finally {
    measure.mockRestore();
  }
});
