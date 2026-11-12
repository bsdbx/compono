import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { navigation } from "@/test-navigation";
import { Boundary, MIRA, renderWithClient, stubApi } from "@/test-utils";
import { TeamHome } from "./team-home";

vi.mock("next/navigation", () =>
  import("@/test-navigation").then((m) => m.navigationMock),
);
vi.mock("@/components/team-sidebar", () => ({ TeamSidebar: () => null }));
vi.mock("@/components/projects/all-projects", () => ({
  AllProjects: ({ team }: { team: { name: string } }) => <h1>{team.name}</h1>,
}));

beforeEach(() => {
  navigation.params = { team: "acme" };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function answer(team: Response) {
  stubApi((request) => {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/account") {
      return Response.json(MIRA);
    }
    if (pathname === "/api/teams/acme") {
      return team;
    }
    return undefined;
  });
}

test("a team of the account shows its name", async () => {
  answer(Response.json({ id: "1", name: "Acme", url: "acme", role: "OWNER" }));
  renderWithClient(<TeamHome />);

  expect(
    await screen.findByRole("heading", { name: "Acme" }),
  ).toBeInTheDocument();
});

test("a team the account isn't in is not found", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  answer(Response.json({ detail: "team_not_found" }, { status: 404 }));
  renderWithClient(
    <Boundary>
      <TeamHome />
    </Boundary>,
  );

  await waitFor(() => expect(navigation.notFound).toHaveBeenCalled());
  vi.mocked(console.error).mockRestore();
});
