import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { NodeTypeInfo } from "@/api/types";
import { AddNodeMenu } from "./add-node-menu";

const text: NodeTypeInfo = {
  type: "text",
  name: "Text",
  category: "Values",
  single: false,
  properties: [],
  sockets: { inputs: [], groups: [], outputs: [] },
};

function showMenu() {
  const choose = vi.fn();
  render(
    <>
      <button type="button">Parent menu</button>
      <AddNodeMenu
        embedded
        x={0}
        y={0}
        nodeTypes={[text]}
        unavailable={new Set()}
        onChoose={choose}
        onClose={() => {}}
      />
    </>,
  );
  return choose;
}

test("entering an open Add Node menu restores focus to its search field", () => {
  showMenu();
  const parent = screen.getByRole("button", { name: "Parent menu" });
  parent.focus();
  fireEvent.pointerOver(screen.getByRole("menu", { name: "Add node" }));
  expect(screen.getByRole("textbox", { name: "Search nodes" })).toHaveFocus();
});

test("mouse category navigation keeps search focused and node choices still click", () => {
  const choose = showMenu();
  const input = screen.getByRole("textbox", { name: "Search nodes" });
  const category = screen.getByRole("menuitem", { name: /Values/ });
  // Browsers focus buttons on mousedown unless the menu cancels that default.
  if (fireEvent.mouseDown(category, { button: 0 })) category.focus();
  fireEvent.click(category);
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: "Tex" } });
  fireEvent.click(screen.getByRole("menuitem", { name: /^Text/ }));
  expect(choose).toHaveBeenCalledWith({ nodeType: text });
});
