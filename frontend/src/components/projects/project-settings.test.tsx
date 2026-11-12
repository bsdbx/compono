import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ListedProject } from "@/api/types.gen";
import { SignedIn } from "@/components/account";
import { stubTeam } from "@/components/team-settings/test-team";
import { MIRA, renderWithClient } from "@/test-utils";
import { ProjectSettings } from "./project-settings";

vi.mock("next/navigation", () =>
  import("@/test-navigation").then((m) => m.navigationMock),
);

afterEach(() => {
  vi.unstubAllGlobals();
});

const BASE = "/api/teams/acme/projects/marketing-site";
const MIRA_IN = { ...MIRA, role: "LEAD" as const };
const JONAS = {
  id: "j2",
  name: "Jonas Lind",
  email: "jonas@acme.dev",
  role: "DEVELOPER" as const,
};
const SOFIA = {
  id: "s3",
  name: "Sofia Reyes",
  email: "sofia@acme.dev",
  role: "MEMBER",
};
const LISTED: ListedProject = {
  id: "p1",
  name: "Marketing site",
  url: "marketing-site",
  description: "Landing pages",
  edited_at: "2026-11-12T10:00:00Z",
  role: "LEAD",
  members: [],
};

function answer(
  {
    teamRole,
    role,
  }: { teamRole: "OWNER" | "MEMBER"; role: "LEAD" | "DEVELOPER" | null },
  more: Record<string, (r: Request) => Response> = {},
) {
  const members = role === null ? [JONAS] : [{ ...MIRA_IN, role }, JONAS];
  return stubTeam({
    "GET /api/account": () => Response.json(MIRA),
    [`GET ${BASE}`]: () => Response.json({ ...LISTED, role }),
    [`GET ${BASE}/members`]: () => Response.json(members),
    "GET /api/teams/acme/members": () =>
      Response.json([
        { ...MIRA, role: teamRole },
        { ...JONAS, role: "MEMBER" },
        SOFIA,
      ]),
    ...more,
  });
}

function renderPanel(teamRole: "OWNER" | "MEMBER") {
  const onClose = vi.fn();
  renderWithClient(
    <SignedIn>
      <ProjectSettings
        team={{ id: "t1", name: "Acme", url: "acme", role: teamRole }}
        project={LISTED}
        onClose={onClose}
      />
    </SignedIn>,
  );
  return onClose;
}

const requests = (fetch: ReturnType<typeof answer>, method: string) =>
  fetch.mock.calls.map(([r]) => r).filter((r) => r.method === method);

test("a lead renames the project as the field is left", async () => {
  const fetch = answer(
    { teamRole: "MEMBER", role: "LEAD" },
    {
      [`PATCH ${BASE}`]: () =>
        Response.json({ ...LISTED, name: "Marketing", url: "marketing" }),
    },
  );
  renderPanel("MEMBER");

  const name = await screen.findByLabelText("Name");
  fireEvent.change(name, { target: { value: "Marketing" } });
  fireEvent.blur(name);

  await waitFor(() => expect(requests(fetch, "PATCH")).toHaveLength(1));
  expect(await requests(fetch, "PATCH")[0]?.json()).toEqual({
    name: "Marketing",
  });
});

test("a lead adds a team member as a developer, and changes roles", async () => {
  const fetch = answer(
    { teamRole: "MEMBER", role: "LEAD" },
    {
      [`PUT ${BASE}/members/s3`]: () =>
        Response.json({ ...SOFIA, role: "DEVELOPER" }),
      [`PUT ${BASE}/members/j2`]: () =>
        Response.json({ ...JONAS, role: "LEAD" }),
    },
  );
  renderPanel("MEMBER");

  const picker = await screen.findByRole("button", {
    name: "Team member to add",
  });
  // Once the team's members have loaded
  await waitFor(() => expect(picker).toBeEnabled());
  fireEvent.keyDown(picker, { key: "Enter" });
  // Only team members who aren't in the project
  const options = await screen.findAllByRole("menuitem");
  expect(options.map((o) => o.textContent)).toEqual([
    "SRSofia Reyes sofia@acme.dev",
  ]);
  expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  fireEvent.click(options[0] as HTMLElement);
  expect(
    screen.getByRole("button", { name: "Team member to add" }),
  ).toHaveTextContent("Sofia Reyes");
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(requests(fetch, "PUT")).toHaveLength(1));
  expect(await requests(fetch, "PUT")[0]?.json()).toEqual({
    role: "DEVELOPER",
  });

  fireEvent.keyDown(screen.getByRole("button", { name: "Change Jonas Lind" }), {
    key: "Enter",
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Make lead" }));
  await waitFor(() => expect(requests(fetch, "PUT")).toHaveLength(2));
  expect(await requests(fetch, "PUT")[1]?.json()).toEqual({ role: "LEAD" });
  // A lead can change their own role too, as the design has it
  expect(
    screen.getByRole("button", { name: "Change Mira Kovalenko" }),
  ).toBeInTheDocument();
  // Leads delete the project, and don't leave it from here
  expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Leave" })).toBeNull();
});

test("a lead removes a member", async () => {
  const fetch = answer(
    { teamRole: "MEMBER", role: "LEAD" },
    {
      [`DELETE ${BASE}/members/j2`]: () => new Response(null, { status: 204 }),
    },
  );
  renderPanel("MEMBER");

  fireEvent.keyDown(
    await screen.findByRole("button", { name: "Change Jonas Lind" }),
    {
      key: "Enter",
    },
  );
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Remove from project" }),
  );

  await waitFor(() => expect(requests(fetch, "DELETE")).toHaveLength(1));
  expect(requests(fetch, "DELETE")[0]?.url).toBe(
    `http://localhost${BASE}/members/j2`,
  );
});

test("deleting the project takes typing its address", async () => {
  const fetch = answer(
    { teamRole: "MEMBER", role: "LEAD" },
    {
      [`DELETE ${BASE}`]: () => new Response(null, { status: 204 }),
    },
  );
  const onClose = renderPanel("MEMBER");

  fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Delete Marketing site?",
  });
  const remove = within(dialog).getByRole("button", { name: "Delete project" });
  expect(remove).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText(/to confirm/), {
    target: { value: "acme/marketing-site" },
  });
  fireEvent.click(remove);

  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(requests(fetch, "DELETE")[0]?.url).toBe(`http://localhost${BASE}`);
});

test("a developer sees the project, its leads and members, and can leave", async () => {
  const fetch = answer(
    { teamRole: "MEMBER", role: "DEVELOPER" },
    {
      [`DELETE ${BASE}/membership`]: () => new Response(null, { status: 204 }),
    },
  );
  const onClose = renderPanel("MEMBER");

  expect(await screen.findByText("Landing pages")).toBeInTheDocument();
  expect(screen.queryByLabelText("Name")).toBeNull();
  expect(screen.queryByLabelText("Team member to add")).toBeNull();
  expect(screen.queryByRole("button", { name: /^Change / })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Leave" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Leave Marketing site?",
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Leave project" }),
  );

  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(requests(fetch, "DELETE")[0]?.url).toBe(
    `http://localhost${BASE}/membership`,
  );
});

test("an owner outside the project manages it, without leaving", async () => {
  answer({ teamRole: "OWNER", role: null });
  renderPanel("OWNER");

  expect(await screen.findByLabelText("Name")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Leave" })).toBeNull();
});
