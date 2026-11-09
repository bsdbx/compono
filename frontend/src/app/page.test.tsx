import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Home from "./page";

test("the home page shows the app's name", () => {
  render(<Home />);
  expect(
    screen.getByRole("heading", { level: 1, name: "Compono" }),
  ).toBeInTheDocument();
});
