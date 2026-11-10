import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import Home from "./page";

// The API's status has its own tests
vi.mock("@/components/api-status", () => ({ ApiStatus: () => null }));

test("the home page shows the app's name", () => {
  render(<Home />);
  expect(
    screen.getByRole("heading", { level: 1, name: "Compono" }),
  ).toBeInTheDocument();
});
