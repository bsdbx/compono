import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MIRA, renderWithClient, stubApi } from "@/test-utils";
import { RedirectIfSignedIn } from "./redirect-if-signed-in";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  router.replace.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("an account that is signed in goes to its projects", async () => {
  stubApi(() => Response.json(MIRA));
  renderWithClient(<RedirectIfSignedIn />);

  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
});

test("a browser that isn't signed in stays to sign in", async () => {
  const fetch = stubApi(() =>
    Response.json({ detail: "no_session" }, { status: 401 }),
  );
  renderWithClient(<RedirectIfSignedIn />);

  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(router.replace).not.toHaveBeenCalled();
});
