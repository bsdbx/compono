import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { navigation } from "@/test-navigation";
import { renderWithClient, stubApi } from "@/test-utils";
import { TeamMenu } from "./team-menu";

vi.mock("next/navigation", () =>
  import("@/test-navigation").then((m) => m.navigationMock),
);

afterEach(() => {
  vi.unstubAllGlobals();
});

const ACME = { id: "1", name: "Acme", url: "acme", role: "OWNER" as const };
const NORTHWIND = {
  id: "2",
  name: "Northwind",
  url: "northwind",
  role: "MEMBER",
};
const ORBIT = { id: "3", name: "Orbit", url: "orbit", role: "OWNER" };

function answer() {
  return stubApi((request) => {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/api/teams") {
      return Response.json([ACME, NORTHWIND]);
    }
    if (request.method === "POST" && pathname === "/api/teams") {
      return Response.json(ORBIT, { status: 201 });
    }
    if (request.method === "POST" && pathname === "/api/invite-links/abc123") {
      return Response.json(NORTHWIND);
    }
    return undefined;
  });
}

async function openMenu() {
  renderWithClient(<TeamMenu team={ACME} />);
  fireEvent.keyDown(screen.getByRole("button", { name: "Acme" }), {
    key: "Enter",
  });
  return await screen.findByRole("menu");
}

test("the menu lists the teams, with the current one checked, and its settings", async () => {
  answer();
  const menu = await openMenu();

  const acme = await within(menu).findByRole("menuitem", { name: /Acme/ });
  expect(acme).toHaveAttribute("href", "/acme");
  expect(within(acme).getByLabelText("Current team")).toBeInTheDocument();
  const northwind = within(menu).getByRole("menuitem", { name: "Northwind" });
  expect(northwind).toHaveAttribute("href", "/northwind");
  expect(
    within(menu).getByRole("menuitem", { name: "Team settings" }),
  ).toHaveAttribute("href", "/acme/settings");
});

test("Create team opens a dialog, and opens the new team", async () => {
  answer();
  const menu = await openMenu();

  fireEvent.click(within(menu).getByRole("menuitem", { name: "Create team" }));
  const dialog = await screen.findByRole("dialog", { name: "Create team" });
  fireEvent.change(within(dialog).getByLabelText("Team name"), {
    target: { value: "Orbit" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create team" }));

  await waitFor(() =>
    expect(navigation.router.push).toHaveBeenCalledWith("/orbit"),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("Join team opens a dialog, and opens the joined team", async () => {
  answer();
  const menu = await openMenu();

  fireEvent.click(within(menu).getByRole("menuitem", { name: "Join team" }));
  const dialog = await screen.findByRole("dialog", { name: "Join team" });
  fireEvent.change(within(dialog).getByLabelText("Invite link"), {
    target: { value: "https://compono.app/join/abc123" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Join" }));

  await waitFor(() =>
    expect(navigation.router.push).toHaveBeenCalledWith("/northwind"),
  );
});

test("Cancel closes a dialog without creating anything", async () => {
  const fetch = answer();
  const menu = await openMenu();

  fireEvent.click(within(menu).getByRole("menuitem", { name: "Create team" }));
  const dialog = await screen.findByRole("dialog", { name: "Create team" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    fetch.mock.calls.filter(([request]) => request.method === "POST"),
  ).toHaveLength(0);
});
