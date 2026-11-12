import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { stubTeam } from "@/components/team-settings/test-team";
import { renderWithClient } from "@/test-utils";
import { AllProjects } from "./all-projects";

afterEach(() => {
  vi.unstubAllGlobals();
});

const OWNER = { id: "t1", name: "Acme", url: "acme", role: "OWNER" as const };
const MEMBER = { ...OWNER, role: "MEMBER" as const };
const person = (n: number) => ({ id: `a${n}`, name: `Person ${n}` });
const project = (
  name: string,
  url: string,
  edited: string,
  extra: object = {},
) => ({
  id: url,
  name,
  url,
  description: "",
  edited_at: edited,
  role: null,
  members: [],
  ...extra,
});
const PROJECTS = [
  project("Checkout flow", "checkout-flow", "2026-11-12T11:00:00Z", {
    role: "LEAD",
    members: [person(1), person(2), person(3), person(4), person(5)],
  }),
  project("Analytics", "analytics", "2026-11-10T11:00:00Z", {
    members: [person(1), person(2), person(3)],
  }),
  project("Marketing site", "marketing-site", "2026-11-12T10:00:00Z"),
];

function answer(
  projects: object[] | Response,
  more: Record<string, (r: Request) => Response> = {},
) {
  return stubTeam({
    "GET /api/teams/acme/projects": () =>
      projects instanceof Response ? projects : Response.json(projects),
    ...more,
  });
}

const cardNames = () =>
  screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

test("the projects show as cards, the last edited first", async () => {
  answer(PROJECTS);
  renderWithClient(<AllProjects team={OWNER} />);

  await screen.findByText("Checkout flow", { selector: "h2" });
  expect(cardNames()).toEqual(["Checkout flow", "Marketing site", "Analytics"]);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "All projects 3",
  );
  const checkout = screen.getByRole("link", { name: /^Checkout flow/ });
  expect(checkout).toHaveAttribute("href", "/acme/checkout-flow");
  // A lead's badge, and two of five members with how many more
  expect(within(checkout).getByText("Lead")).toBeInTheDocument();
  expect(within(checkout).getByText("+3")).toBeInTheDocument();
  // Three members show without a count
  const analytics = screen.getByRole("link", { name: /^Analytics/ });
  expect(within(analytics).queryByText(/^\+/)).toBeNull();
});

test("sorting by name and searching narrow the grid", async () => {
  answer(PROJECTS);
  renderWithClient(<AllProjects team={OWNER} />);

  fireEvent.keyDown(
    await screen.findByRole("button", { name: "Sort by Last edited" }),
    { key: "Enter" },
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "Name" }));
  expect(cardNames()).toEqual(["Analytics", "Checkout flow", "Marketing site"]);

  fireEvent.change(screen.getByLabelText("Search projects"), {
    target: { value: "MARKETING" },
  });
  expect(cardNames()).toEqual(["Marketing site"]);

  fireEvent.change(screen.getByLabelText("Search projects"), {
    target: { value: "nothing" },
  });
  expect(screen.getByText("No projects found")).toBeInTheDocument();
});

test("with no projects, owners are asked to create one and members told to wait", async () => {
  answer([]);
  renderWithClient(<AllProjects team={OWNER} />);
  expect(
    await screen.findByText("Create one to start building components."),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "New project" }),
  ).toBeInTheDocument();
});

test("members don't create projects", async () => {
  answer([]);
  renderWithClient(<AllProjects team={MEMBER} />);
  expect(
    await screen.findByText(
      "When a lead adds you to a project, it shows up here.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "New project" })).toBeNull();
});

test("projects that don't load can be tried again", async () => {
  const fetch = answer(new Response(null, { status: 500 }));
  renderWithClient(<AllProjects team={OWNER} />);

  fireEvent.click(
    await screen.findByRole("button", { name: "Try again" }, { timeout: 5000 }),
  );
  await waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThan(1));
});

test("an owner creates a project, and it joins the grid", async () => {
  let projects = [PROJECTS[2]];
  const fetch = stubTeam({
    "GET /api/teams/acme/projects": () => Response.json(projects),
    "POST /api/teams/acme/projects": () => {
      projects = [
        project("Pricing page", "pricing-page", "2026-11-12T12:00:00Z"),
        ...projects,
      ];
      return Response.json(projects[0], { status: 201 });
    },
  });
  renderWithClient(<AllProjects team={OWNER} />);

  fireEvent.click(await screen.findByRole("button", { name: "New project" }));
  const dialog = await screen.findByRole("dialog", { name: "New project" });
  fireEvent.change(within(dialog).getByLabelText("Name"), {
    target: { value: "  Pricing page " },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Create project" }),
  );

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    await screen.findByText("Pricing page", { selector: "h2" }),
  ).toBeInTheDocument();
  const post = fetch.mock.calls.find(([r]) => r.method === "POST")?.[0];
  expect(await post?.json()).toEqual({ name: "Pricing page" });
});

test("a taken name says so", async () => {
  answer(PROJECTS, {
    "POST /api/teams/acme/projects": () =>
      Response.json({ detail: "name_taken" }, { status: 409 }),
  });
  renderWithClient(<AllProjects team={OWNER} />);

  fireEvent.click(await screen.findByRole("button", { name: "New project" }));
  const dialog = await screen.findByRole("dialog", { name: "New project" });
  fireEvent.change(within(dialog).getByLabelText("Name"), {
    target: { value: "Analytics" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Create project" }),
  );

  expect(
    await within(dialog).findByText(
      "Acme already has a project with this name.",
    ),
  ).toBeInTheDocument();
});
