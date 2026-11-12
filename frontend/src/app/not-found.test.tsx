import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import NotFound from "./not-found";

test("the not-found page goes back to the projects", () => {
  render(<NotFound />);

  expect(
    screen.getByRole("heading", { name: "Page not found" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Back to projects" }),
  ).toHaveAttribute("href", "/");
});
