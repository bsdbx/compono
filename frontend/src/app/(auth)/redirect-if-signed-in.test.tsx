import { waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { navigation } from "@/test-navigation";
import { MIRA, renderWithClient, stubApi } from "@/test-utils";
import { RedirectIfSignedIn } from "./redirect-if-signed-in";

vi.mock("next/navigation", () =>
  import("@/test-navigation").then((m) => m.navigationMock),
);

afterEach(() => {
  vi.unstubAllGlobals();
});

test("an account that is signed in goes to its projects", async () => {
  stubApi(() => Response.json(MIRA));
  renderWithClient(<RedirectIfSignedIn />);

  await waitFor(() =>
    expect(navigation.router.replace).toHaveBeenCalledWith("/"),
  );
});

test("a browser that isn't signed in stays to sign in", async () => {
  const fetch = stubApi(() =>
    Response.json({ detail: "no_session" }, { status: 401 }),
  );
  renderWithClient(<RedirectIfSignedIn />);

  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(navigation.router.replace).not.toHaveBeenCalled();
});

test("an account that is signed in goes where it was going", async () => {
  stubApi(() => Response.json(MIRA));
  navigation.search = new URLSearchParams({ next: "/join/abc123" });
  renderWithClient(<RedirectIfSignedIn />);

  await waitFor(() =>
    expect(navigation.router.replace).toHaveBeenCalledWith("/join/abc123"),
  );
});
