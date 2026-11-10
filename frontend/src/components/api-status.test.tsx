import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { client } from "@/api/client.gen";
import { ApiStatus } from "./api-status";

beforeEach(() => {
  // Tests run without a page, so relative URLs need a base
  client.setConfig({ baseUrl: "http://localhost" });
});

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
    expect(request.url).toBe("http://localhost/api/health");
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
