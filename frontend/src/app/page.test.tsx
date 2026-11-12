import { waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { navigation } from "@/test-navigation";
import { MIRA, renderWithClient, stubApi } from "@/test-utils";
import Home from "./page";

vi.mock("next/navigation", () =>
  import("@/test-navigation").then((m) => m.navigationMock),
);

afterEach(() => {
  vi.unstubAllGlobals();
});

function answer(teams: object[]) {
  stubApi((request) => {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/account") {
      return Response.json(MIRA);
    }
    if (pathname === "/api/teams") {
      return Response.json(teams);
    }
    return undefined;
  });
}

test("the start page opens the account's first team", async () => {
  answer([
    { id: "1", name: "Acme", url: "acme", role: "OWNER" },
    { id: "2", name: "Northwind", url: "northwind", role: "MEMBER" },
  ]);
  renderWithClient(<Home />);

  await waitFor(() =>
    expect(navigation.router.replace).toHaveBeenCalledWith("/acme"),
  );
});

test("an account without a team sets one up", async () => {
  answer([]);
  renderWithClient(<Home />);

  await waitFor(() =>
    expect(navigation.router.replace).toHaveBeenCalledWith("/teams/new"),
  );
});
