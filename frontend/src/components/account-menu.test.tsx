import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { currentAccountQueryKey } from "@/api/@tanstack/react-query.gen";
import { MIRA, renderWithClient, stubApi } from "@/test-utils";
import { SignedIn } from "./account";
import { AccountMenu } from "./account-menu";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the account menu shows who is signed in, and signs them out", async () => {
  const fetch = stubApi((request) => {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/api/account") {
      return Response.json(MIRA);
    }
    if (request.method === "DELETE" && pathname === "/api/sessions/current") {
      return new Response(null, { status: 204 });
    }
    return undefined;
  });
  const queryClient = renderWithClient(
    <SignedIn>
      <AccountMenu />
    </SignedIn>,
  );

  const trigger = await screen.findByRole("button", { name: /Mira Kovalenko/ });
  expect(trigger).toHaveTextContent("MK");
  expect(trigger).toHaveTextContent("mira@acme.dev");

  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));

  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/sign-in"));
  // Otherwise sign in would still see the account, and send it back
  expect(queryClient.getQueryData(currentAccountQueryKey())).toBeUndefined();
  const signOut = fetch.mock.calls
    .map(([request]) => request)
    .find((request) => request.method === "DELETE");
  expect(signOut?.url).toBe("http://localhost/api/sessions/current");
});
