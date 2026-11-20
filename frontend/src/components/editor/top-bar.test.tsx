import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { projectMembersQueryKey } from "@/api/queries";
import type { Project, ProjectMember } from "@/api/types";
import { SignedIn } from "@/components/account";
import { MIRA, renderWithClient, stubApi } from "@/test-utils";
import { TopBar } from "./top-bar";

afterEach(() => vi.unstubAllGlobals());

const TEAM = { id: "t1", name: "Acme", url: "acme", role: "OWNER" as const };
const PROJECT: Project = {
  id: "p1",
  name: "Marketing site",
  url: "marketing-site",
  description: "",
  edited_at: "2026-11-20T10:00:00Z",
  role: "LEAD",
};
const BASE = "/api/teams/acme/projects/marketing-site";
const JONAS: ProjectMember = {
  id: "j2",
  name: "Jonas Linn",
  email: "jonas@acme.dev",
  role: "LEAD",
};
const DANIEL: ProjectMember = {
  id: "d3",
  name: "Daniel Novak",
  email: "daniel@acme.dev",
  role: "DEVELOPER",
};

function show(members: object[], role: Project["role"] = "LEAD") {
  const fetch = stubApi((request) => {
    const path = new URL(request.url).pathname;
    if (path === "/api/account") return Response.json(MIRA);
    if (path === `${BASE}/members`) return Response.json(members);
    if (path === "/api/teams/acme/members")
      return Response.json([
        { id: "outside", name: "Team Owner", role: "OWNER" },
      ]);
    return undefined;
  });
  const client = renderWithClient(
    <SignedIn>
      <TopBar
        team={TEAM}
        project={{ ...PROJECT, role }}
        component={undefined}
        renameNow={false}
        onRenamed={() => {}}
      />
    </SignedIn>,
  );
  return { fetch, client };
}

test("the topbar shows assigned leads and developers, without duplicating the account", async () => {
  const { fetch, client } = show([
    JONAS,
    DANIEL,
    { ...MIRA, role: "LEAD" },
    {
      id: "outside",
      name: "Team Owner",
      email: "owner@acme.dev",
      role: "OWNER",
    },
  ]);
  const list = await screen.findByRole("list", { name: "Project members" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  expect(within(list).getByText("Jonas Linn, Lead")).toBeInTheDocument();
  expect(within(list).getByText("Daniel Novak, Developer")).toBeInTheDocument();
  expect(list).not.toHaveTextContent("Mira");
  expect(list).not.toHaveTextContent("Team Owner");
  expect(
    fetch.mock.calls.some(
      ([request]) =>
        new URL(request.url).pathname === "/api/teams/acme/members",
    ),
  ).toBe(false);
  fireEvent.pointerDown(screen.getByRole("button", { name: "Account" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(await screen.findByText(MIRA.email)).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  client.setQueryData(
    projectMembersQueryKey({
      path: { team_url: "acme", project_url: "marketing-site" },
    }),
    [DANIEL],
  );
  await waitFor(() =>
    expect(within(list).getAllByRole("listitem")).toHaveLength(1),
  );
  expect(list).not.toHaveTextContent("Jonas");
});

test("a team owner outside the project still sees its assigned members", async () => {
  show([JONAS, DANIEL], null);
  const list = await screen.findByRole("list", { name: "Project members" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
});

test("with no other assigned members only the account avatar is shown", async () => {
  const { fetch } = show([{ ...MIRA, role: "DEVELOPER" }]);
  await screen.findByRole("button", { name: "Account" });
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(
        ([request]) => new URL(request.url).pathname === `${BASE}/members`,
      ),
    ).toBe(true),
  );
  expect(
    screen.queryByRole("list", { name: "Project members" }),
  ).not.toBeInTheDocument();
});
