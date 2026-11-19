import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { Link, useParams } from "@/lib/navigation";
import { MIRA, stubApi } from "@/test-utils";
import { App } from "./app";

// The editor's behavior has its own tests; here we check its lifetime across routes.
vi.mock("@/components/editor/editor", () => ({
  Editor: function Editor() {
    const { component } = useParams<{ component?: string }>();
    const [view, setView] = useState("Graph");
    return (
      <>
        <p>Open: {component}</p>
        <button type="button" onClick={() => setView("Code")}>
          {view}
        </button>
        <Link href="/acme/pricing/c2">Second component</Link>
      </>
    );
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function open(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

test("a direct team link sends a signed-out visitor to sign in", async () => {
  stubApi(() => Response.json({ detail: "no_session" }, { status: 401 }));
  open("/acme");
  expect(
    await screen.findByRole("heading", { name: "Welcome back" }),
  ).toBeInTheDocument();
  await waitFor(() => expect(document.title).toBe("Sign in · Compono"));
});

test("the members route wins over the dynamic editor route", async () => {
  stubApi((request) => {
    const path = new URL(request.url).pathname;
    if (path === "/api/account") return Response.json(MIRA);
    if (path === "/api/teams/acme")
      return Response.json({
        id: "t1",
        name: "Acme",
        url: "acme",
        role: "OWNER",
      });
    if (path.endsWith("/members"))
      return Response.json([{ ...MIRA, role: "MEMBER" }]);
  });
  open("/acme/settings/members");
  expect(
    await screen.findByRole("heading", { name: "Members" }),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Open:/)).not.toBeInTheDocument();
});

test("switching components preserves the editor's selected view", async () => {
  open("/acme/pricing/c1");
  fireEvent.click(await screen.findByRole("button", { name: "Graph" }));
  fireEvent.click(screen.getByRole("link", { name: "Second component" }));
  expect(await screen.findByText("Open: c2")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Code" })).toBeInTheDocument();
});

test.each(["/acme/settings", "/acme/settings/members"])(
  "a member cannot open %s directly",
  async (path) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = stubApi((request) => {
      const pathname = new URL(request.url).pathname;
      if (pathname === "/api/account") return Response.json(MIRA);
      if (pathname === "/api/teams/acme")
        return Response.json({
          id: "t1",
          name: "Acme",
          url: "acme",
          role: "MEMBER",
        });
      if (pathname.endsWith("/members")) return Response.json([MIRA]);
    });
    open(path);
    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Team settings" }),
    ).toBeNull();
    expect(fetch.mock.calls.some(([r]) => r.url.endsWith("/members"))).toBe(
      false,
    );
  },
);

test("an inaccessible team shows the existing not-found page and can be left", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  stubApi((request) =>
    new URL(request.url).pathname === "/api/account"
      ? Response.json(MIRA)
      : Response.json({ detail: "team_not_found" }, { status: 404 }),
  );
  open("/missing");
  expect(
    await screen.findByRole("heading", { name: "Page not found" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Back to projects" }));
  expect(
    await screen.findByRole("heading", { name: "Something went wrong" }),
  ).toBeInTheDocument();
});

test("retrying the error page refetches a failed request", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let available = false;
  stubApi((request) => {
    if (!available)
      return Response.json({ detail: "unavailable" }, { status: 503 });
    const path = new URL(request.url).pathname;
    if (path === "/api/account") return Response.json(MIRA);
    if (path === "/api/teams") return Response.json([]);
  });
  open("/");
  expect(
    await screen.findByRole("heading", { name: "Something went wrong" }),
  ).toBeInTheDocument();
  available = true;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    await screen.findByRole("heading", { name: "Set up your team" }),
  ).toBeInTheDocument();
});
