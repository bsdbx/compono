import { screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderWithClient, stubApi } from "@/test-utils";
import { TeamSidebar } from "./team-sidebar";

vi.mock("@/components/account-menu", () => ({ AccountMenu: () => null }));
vi.mock("@/components/team-menu", () => ({ TeamMenu: () => null }));

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the sidebar links to the team's projects, and counts them", async () => {
  stubApi((request) =>
    new URL(request.url).pathname === "/api/teams/acme/projects"
      ? Response.json([{ id: "p1" }, { id: "p2" }, { id: "p3" }])
      : undefined,
  );
  renderWithClient(
    <TeamSidebar
      team={{ id: "1", name: "Acme", url: "acme", role: "OWNER" }}
    />,
  );

  const link = screen.getByRole("link", { name: /All projects/ });
  expect(link).toHaveAttribute("href", "/acme");
  expect(await screen.findByText("3")).toBeInTheDocument();
});
