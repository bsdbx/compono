import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SignedIn } from "@/components/account";
import { navigation } from "@/test-navigation";
import { MIRA, renderWithClient } from "@/test-utils";
import { GeneralSettings } from "./general-settings";
import { JONAS, MIRA_MEMBER, stubTeam } from "./test-team";

vi.mock("next/navigation", () =>
  import("@/test-navigation").then((m) => m.navigationMock),
);
vi.mock("@/components/account-menu", () => ({ AccountMenu: () => null }));

beforeEach(() => {
  navigation.params = { team: "acme" };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ACME = { id: "t1", name: "Acme", url: "acme", role: "OWNER" };

function answer(
  role: "OWNER" | "MEMBER",
  members: object[],
  more: Record<string, (request: Request) => Response> = {},
) {
  return stubTeam({
    "GET /api/account": () => Response.json(MIRA),
    "GET /api/teams/acme": () => Response.json({ ...ACME, role }),
    "GET /api/teams/acme/members": () => Response.json(members),
    "GET /api/teams/acme/projects": () => Response.json([{}, {}, {}]),
    ...more,
  });
}

function renderPage() {
  renderWithClient(
    <SignedIn>
      <GeneralSettings />
    </SignedIn>,
  );
}

test("an owner renames the team as the field is left", async () => {
  const fetch = answer("OWNER", [MIRA_MEMBER, JONAS], {
    "PATCH /api/teams/acme": () => Response.json({ ...ACME, name: "Acme Inc" }),
  });
  renderPage();

  const name = await screen.findByLabelText("Team name");
  expect(name).toHaveValue("Acme");
  fireEvent.change(name, { target: { value: "Acme Inc" } });
  fireEvent.blur(name);

  await waitFor(() =>
    expect(fetch.mock.calls.some(([r]) => r.method === "PATCH")).toBe(true),
  );
  const patch = fetch.mock.calls.find(([r]) => r.method === "PATCH")?.[0];
  expect(await patch?.json()).toEqual({ name: "Acme Inc" });
  expect(navigation.router.replace).not.toHaveBeenCalled();
});

test("a new URL moves the settings to it", async () => {
  const fetch = answer("OWNER", [MIRA_MEMBER], {
    "PATCH /api/teams/acme": () => Response.json({ ...ACME, url: "acme-inc" }),
  });
  renderPage();

  const url = await screen.findByLabelText("Team URL");
  fireEvent.change(url, { target: { value: "acme-inc" } });
  fireEvent.blur(url);

  await waitFor(() =>
    expect(navigation.router.replace).toHaveBeenCalledWith(
      "/acme-inc/settings",
    ),
  );
  // Only what changed is sent
  const patch = fetch.mock.calls.find(([r]) => r.method === "PATCH")?.[0];
  expect(await patch?.json()).toEqual({ url: "acme-inc" });
});

test("a taken URL says so", async () => {
  answer("OWNER", [MIRA_MEMBER], {
    "PATCH /api/teams/acme": () =>
      Response.json({ detail: "url_taken" }, { status: 409 }),
  });
  renderPage();

  const url = await screen.findByLabelText("Team URL");
  fireEvent.change(url, { target: { value: "northwind" } });
  fireEvent.blur(url);

  expect(
    await screen.findByText(
      "localhost:3000/northwind is taken. Try a different URL.",
    ),
  ).toBeInTheDocument();
});

test("a member sees the name, URL and owners, and can only leave", async () => {
  answer("MEMBER", [
    { ...MIRA_MEMBER, role: "MEMBER" },
    { ...JONAS, role: "OWNER" },
  ]);
  renderPage();

  expect(
    await screen.findByText("Only owners can change these."),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("Team name")).toBeNull();
  expect(await screen.findByText("Jonas Lind")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Leave team" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Delete team" })).toBeNull();
});

test("the only owner is asked to hand the team over first", async () => {
  answer("OWNER", [MIRA_MEMBER, JONAS]);
  renderPage();

  fireEvent.click(await screen.findByRole("button", { name: "Leave team" }));

  const dialog = await screen.findByRole("dialog", {
    name: "Hand over Acme first",
  });
  expect(
    within(dialog).getByRole("link", { name: "Go to members" }),
  ).toHaveAttribute("href", "/acme/settings/members");
});

test("a member leaves, and goes to their other teams", async () => {
  const fetch = answer(
    "MEMBER",
    [
      { ...MIRA_MEMBER, role: "MEMBER" },
      { ...JONAS, role: "OWNER" },
    ],
    {
      "DELETE /api/teams/acme/membership": () =>
        new Response(null, { status: 204 }),
    },
  );
  renderPage();

  fireEvent.click(await screen.findByRole("button", { name: "Leave team" }));
  const dialog = await screen.findByRole("dialog", { name: "Leave Acme?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Leave team" }));

  await waitFor(() =>
    expect(navigation.router.replace).toHaveBeenCalledWith("/"),
  );
  expect(fetch.mock.calls.some(([r]) => r.method === "DELETE")).toBe(true);
});

test("deleting the team takes typing its URL", async () => {
  const fetch = answer("OWNER", [MIRA_MEMBER], {
    "DELETE /api/teams/acme": () => new Response(null, { status: 204 }),
  });
  renderPage();

  fireEvent.click(await screen.findByRole("button", { name: "Delete team" }));
  const dialog = await screen.findByRole("dialog", { name: "Delete Acme?" });
  expect(dialog).toHaveTextContent("its 3 projects");
  const remove = within(dialog).getByRole("button", { name: "Delete team" });
  expect(remove).toBeDisabled();

  fireEvent.change(within(dialog).getByLabelText(/to confirm/), {
    target: { value: "acme" },
  });
  fireEvent.click(remove);

  await waitFor(() =>
    expect(navigation.router.replace).toHaveBeenCalledWith("/"),
  );
  expect(
    fetch.mock.calls.some(
      ([r]) => r.method === "DELETE" && r.url.endsWith("/api/teams/acme"),
    ),
  ).toBe(true);
});
