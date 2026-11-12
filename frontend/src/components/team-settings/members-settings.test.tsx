import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SignedIn } from "@/components/account";
import { navigation } from "@/test-navigation";
import { MIRA, renderWithClient } from "@/test-utils";
import { MembersSettings } from "./members-settings";
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

const LENA = {
  id: "l3",
  name: "Lena Park",
  email: "lena@acme.dev",
  role: "OWNER",
};

function answer(
  role: "OWNER" | "MEMBER",
  more: Record<string, (request: Request) => Response> = {},
) {
  return stubTeam({
    "GET /api/account": () => Response.json(MIRA),
    "GET /api/teams/acme": () =>
      Response.json({ id: "t1", name: "Acme", url: "acme", role }),
    "GET /api/teams/acme/members": () =>
      Response.json([{ ...MIRA_MEMBER, role }, JONAS, LENA]),
    "GET /api/teams/acme/invite-link": () =>
      Response.json({ token: "abc123", expires_at: "2026-11-12T15:42:00Z" }),
    ...more,
  });
}

function renderPage() {
  renderWithClient(
    <SignedIn>
      <MembersSettings />
    </SignedIn>,
  );
}

const row = (name: string) =>
  screen.getByText(name).closest("li") as HTMLElement;

test("an owner sees the invite link, and copies it", async () => {
  const writeText = vi.fn(async () => {});
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  answer("OWNER");
  renderPage();

  const link = await screen.findByLabelText("Invite link");
  await waitFor(() =>
    expect(link).toHaveValue("http://localhost:3000/join/abc123"),
  );
  expect(screen.getByText(/joins Acme as a member, until/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await screen.findByRole("button", { name: "Copied" });
  expect(writeText).toHaveBeenCalledWith("http://localhost:3000/join/abc123");
});

test("the list shows everyone, and only members can be changed", async () => {
  answer("OWNER");
  renderPage();

  expect(await screen.findByText("3 members")).toBeInTheDocument();
  expect(row("Mira Kovalenko")).toHaveTextContent("(you)");
  expect(within(row("Mira Kovalenko")).queryByRole("button")).toBeNull();
  expect(within(row("Lena Park")).queryByRole("button")).toBeNull();
  expect(
    within(row("Jonas Lind")).getByRole("button", {
      name: "Change Jonas Lind",
    }),
  ).toBeInTheDocument();
});

test("an owner makes a member an owner", async () => {
  const fetch = answer("OWNER", {
    "PUT /api/teams/acme/owners/0193f2c4-7c1e-7000-8000-000000000002": () =>
      Response.json({ ...JONAS, role: "OWNER" }),
  });
  renderPage();

  fireEvent.keyDown(
    await screen.findByRole("button", { name: "Change Jonas Lind" }),
    { key: "Enter" },
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: "Make owner" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Make Jonas an owner?",
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Make owner" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(fetch.mock.calls.some(([r]) => r.method === "PUT")).toBe(true);
});

test("an owner removes a member", async () => {
  const fetch = answer("OWNER", {
    "DELETE /api/teams/acme/members/0193f2c4-7c1e-7000-8000-000000000002": () =>
      new Response(null, { status: 204 }),
  });
  renderPage();

  fireEvent.keyDown(
    await screen.findByRole("button", { name: "Change Jonas Lind" }),
    { key: "Enter" },
  );
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Remove from team" }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "Remove Jonas from Acme?",
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Remove from team" }),
  );

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(fetch.mock.calls.some(([r]) => r.method === "DELETE")).toBe(true);
});

test("searching narrows the list by name or email", async () => {
  answer("OWNER");
  renderPage();

  const search = await screen.findByLabelText("Search members");
  fireEvent.change(search, { target: { value: "LENA@" } });
  expect(screen.getByText("Lena Park")).toBeInTheDocument();
  expect(screen.queryByText("Jonas Lind")).toBeNull();

  fireEvent.change(search, { target: { value: "nobody" } });
  expect(screen.getByText("No members match “nobody”.")).toBeInTheDocument();
});

test("a member sees the list, without the invite link or changes", async () => {
  const fetch = answer("MEMBER");
  renderPage();

  expect(await screen.findByText("3 members")).toBeInTheDocument();
  expect(
    screen.getByText(
      "Everyone in Acme. Only owners can invite or remove people.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("Invite link")).toBeNull();
  expect(screen.queryByRole("button", { name: /Change/ })).toBeNull();
  expect(fetch.mock.calls.some(([r]) => r.url.endsWith("/invite-link"))).toBe(
    false,
  );
});
