import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import Home from "./page";

// Signing in, the account menu and the API's status have their own tests
vi.mock("@/components/account", () => ({
  SignedIn: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/account-menu", () => ({ AccountMenu: () => null }));
vi.mock("@/components/api-status", () => ({ ApiStatus: () => null }));

test("the home page shows the app's name", () => {
  render(<Home />);
  expect(
    screen.getByRole("heading", { level: 1, name: "Compono" }),
  ).toBeInTheDocument();
});
