import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, test } from "vitest";
import { ResizeHandle } from "./resize-handle";

function Divider({
  axis = "horizontal",
  reverse = false,
  collapsible = false,
}: {
  axis?: "horizontal" | "vertical";
  reverse?: boolean;
  collapsible?: boolean;
}) {
  const [size, setSize] = useState(200);
  return (
    <ResizeHandle
      label="Panel size"
      axis={axis}
      reverse={reverse}
      value={size}
      min={180}
      max={400}
      {...(collapsible ? { collapsedSize: 44 } : {})}
      onChange={setSize}
    />
  );
}

test("arrows resize a panel, with larger steps on Shift and bounded Home/End", () => {
  render(<Divider />);
  const handle = screen.getByRole("separator", { name: "Panel size" });
  expect(handle).toHaveAttribute("aria-orientation", "vertical");
  fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
  expect(handle).toHaveAttribute("aria-valuenow", "240");
  fireEvent.keyDown(handle, { key: "Home" });
  fireEvent.keyDown(handle, { key: "ArrowLeft" });
  expect(handle).toHaveAttribute("aria-valuenow", "180");
  fireEvent.keyDown(handle, { key: "End" });
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(handle).toHaveAttribute("aria-valuenow", "400");
});

test("a collapsed library can be reopened with an arrow and collapsed at its minimum", () => {
  render(<Divider collapsible />);
  const handle = screen.getByRole("separator");
  fireEvent.keyDown(handle, { key: "Home" });
  expect(handle).toHaveAttribute("aria-valuenow", "44");
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(handle).toHaveAttribute("aria-valuenow", "180");
  fireEvent.keyDown(handle, { key: "ArrowLeft" });
  expect(handle).toHaveAttribute("aria-valuenow", "44");
});

test("the right edge reverses movement, and a vertical split uses Up/Down", () => {
  const { rerender } = render(<Divider reverse />);
  const handle = screen.getByRole("separator");
  fireEvent.keyDown(handle, { key: "ArrowLeft" });
  expect(handle).toHaveAttribute("aria-valuenow", "210");
  rerender(<Divider axis="vertical" />);
  expect(handle).toHaveAttribute("aria-orientation", "horizontal");
  fireEvent.keyDown(handle, { key: "ArrowDown" });
  expect(handle).toHaveAttribute("aria-valuenow", "220");
  fireEvent.keyDown(handle, { key: "ArrowUp", shiftKey: true });
  expect(handle).toHaveAttribute("aria-valuenow", "180");
});
