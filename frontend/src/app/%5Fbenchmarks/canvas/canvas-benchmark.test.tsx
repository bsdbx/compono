import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CanvasBenchmark } from "./canvas-benchmark";

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

test("the benchmark starts with 200 nodes", () => {
  render(<CanvasBenchmark />);

  expect(screen.getByRole("button", { name: "200 nodes" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByText("340 wires")).toBeInTheDocument();
  expect(document.querySelectorAll(".react-flow__node")).toHaveLength(200);
});

test("choosing another number of nodes builds that graph", () => {
  render(<CanvasBenchmark />);

  fireEvent.click(screen.getByRole("button", { name: "400 nodes" }));

  expect(screen.getByRole("button", { name: "400 nodes" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "200 nodes" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(document.querySelectorAll(".react-flow__node")).toHaveLength(400);
});
