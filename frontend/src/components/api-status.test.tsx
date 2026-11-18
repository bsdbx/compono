import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ApiStatus } from "./api-status";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderStatus() {
  // No retries, so a failed request fails the query at once
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ApiStatus />
    </QueryClientProvider>,
  );
}

test("shows the status the API returns", async () => {
  const fetch = vi.fn(async (request: Request) => {
    expect(request.url).toBe("http://localhost:3000/api/health");
    return Response.json({ status: "ok" });
  });
  vi.stubGlobal("fetch", fetch);
  renderStatus();
  expect(await screen.findByText("API: ok")).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledOnce();
});

test("says when the API is unreachable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 500 })),
  );
  renderStatus();
  expect(
    await screen.findByText("The API is unreachable."),
  ).toBeInTheDocument();
});
