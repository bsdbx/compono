import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CopyButton } from "./copy-button";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("successful clipboard feedback resets, retaining both animated states", async () => {
  vi.useFakeTimers();
  const writeText = vi.fn(async () => {});
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(<CopyButton text="export default function Card() {}" />);
  const copy = screen.getByRole("button", { name: "Copy" });
  const states = copy.querySelectorAll("span span");
  await act(async () => {
    fireEvent.click(copy);
  });
  expect(writeText).toHaveBeenCalledWith("export default function Card() {}");
  expect(screen.getByRole("button", { name: "Copied" })).toBe(copy);
  act(() => vi.advanceTimersByTime(1500));
  expect(screen.getByRole("button", { name: "Copy" })).toBe(copy);
  expect([...copy.querySelectorAll("span span")]).toEqual([...states]);
});

test("a failed clipboard write does not claim the text was copied", async () => {
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: async () => {
        throw new Error("denied");
      },
    },
  });
  render(<CopyButton text="Card" />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  });
  expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
});
