import { screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { navigation } from "@/test-navigation";
import { Boundary, MIRA, renderWithClient, stubApi } from "@/test-utils";
import {
  notSignedIn,
  SignedIn,
  signInUrl,
  useSignedInAccount,
} from "./account";

vi.mock("next/navigation", () =>
  import("@/test-navigation").then((m) => m.navigationMock),
);

afterEach(() => {
  vi.unstubAllGlobals();
});

function Name() {
  return <p>{useSignedInAccount().name}</p>;
}

test("the API's reasons for signing nobody in are told apart from other errors", () => {
  expect(notSignedIn({ detail: "signed_out" })).toBe("signed_out");
  expect(notSignedIn({ detail: "expired" })).toBe("expired");
  expect(notSignedIn({ detail: "no_session" })).toBe("no_session");
  expect(notSignedIn({ detail: "team_not_found" })).toBeUndefined();
  expect(notSignedIn(new TypeError("Failed to fetch"))).toBeUndefined();
});

test("sign in says why only when this browser was signed out", () => {
  expect(signInUrl("no_session")).toBe("/sign-in");
  expect(signInUrl("signed_out")).toBe("/sign-in?reason=signed_out");
});

test("a signed-in account sees the page", async () => {
  stubApi(() => Response.json(MIRA));
  renderWithClient(
    <SignedIn>
      <Name />
    </SignedIn>,
  );

  expect(await screen.findByText("Mira Kovalenko")).toBeInTheDocument();
  expect(navigation.router.replace).not.toHaveBeenCalled();
});

test("a browser signed out from another device goes to sign in, saying so", async () => {
  stubApi(() => Response.json({ detail: "signed_out" }, { status: 401 }));
  renderWithClient(
    <SignedIn>
      <Name />
    </SignedIn>,
  );

  await waitFor(() =>
    expect(navigation.router.replace).toHaveBeenCalledWith(
      "/sign-in?reason=signed_out",
    ),
  );
  expect(screen.queryByText("Mira Kovalenko")).toBeNull();
});

test("any other error goes to the error page", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  stubApi(() => new Response(null, { status: 500 }));
  renderWithClient(
    <Boundary>
      <SignedIn>
        <Name />
      </SignedIn>
    </Boundary>,
  );

  expect(await screen.findByText("The error page")).toBeInTheDocument();
  expect(navigation.router.replace).not.toHaveBeenCalled();
  vi.mocked(console.error).mockRestore();
});
