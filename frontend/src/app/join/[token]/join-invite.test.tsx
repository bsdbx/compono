import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { navigation } from "@/test-navigation";
import { MIRA, renderWithClient, stubApi } from "@/test-utils";
import { JoinInvite } from "./join-invite";

vi.mock("next/navigation", () =>
  import("@/test-navigation").then((m) => m.navigationMock),
);

beforeEach(() => {
  navigation.params = { token: "abc123" };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const NORTHWIND = {
  id: "2",
  name: "Northwind",
  url: "northwind",
  role: "MEMBER",
};

function answer({ valid, signedIn }: { valid: boolean; signedIn: boolean }) {
  return stubApi((request) => {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/account") {
      return signedIn
        ? Response.json(MIRA)
        : Response.json({ detail: "no_session" }, { status: 401 });
    }
    if (pathname === "/api/invite-links/abc123") {
      if (!valid) {
        return Response.json(
          { detail: "invite_link_not_valid" },
          { status: 404 },
        );
      }
      return request.method === "POST"
        ? Response.json(NORTHWIND)
        : Response.json({ team_name: "Northwind" });
    }
    return undefined;
  });
}

test("signed out, the link offers to sign up or in, and to come back", async () => {
  answer({ valid: true, signedIn: false });
  renderWithClient(<JoinInvite />);

  expect(
    await screen.findByRole("heading", { name: "Join Northwind" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Create an account" }),
  ).toHaveAttribute("href", "/sign-up?next=%2Fjoin%2Fabc123");
  expect(
    screen.getByRole("link", { name: "I already have an account" }),
  ).toHaveAttribute("href", "/sign-in?next=%2Fjoin%2Fabc123");
});

test("signed in, the link joins the team and opens it", async () => {
  answer({ valid: true, signedIn: true });
  renderWithClient(<JoinInvite />);

  fireEvent.click(
    await screen.findByRole("button", { name: "Join Northwind" }),
  );

  await waitFor(() =>
    expect(navigation.router.replace).toHaveBeenCalledWith("/northwind"),
  );
});

test("a link that isn't valid says so", async () => {
  answer({ valid: false, signedIn: true });
  renderWithClient(<JoinInvite />);

  expect(
    await screen.findByRole("heading", {
      name: "This invite link isn’t valid",
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Back to projects" }),
  ).toHaveAttribute("href", "/");
});
