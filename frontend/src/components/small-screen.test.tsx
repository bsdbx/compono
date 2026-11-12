import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SmallScreen } from "./small-screen";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a small screen copies the page's link, to open on a computer", async () => {
  const writeText = vi.fn(async () => {});
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(<SmallScreen />);

  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

  expect(
    await screen.findByRole("button", { name: "Link copied" }),
  ).toBeInTheDocument();
  expect(writeText).toHaveBeenCalledWith(window.location.href);
});
