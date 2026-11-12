import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { client } from "@/api/client.gen";

/** Answers the API's requests with the handler, or 404 when it gives nothing. */
export function stubApi(handler: (request: Request) => Response | undefined) {
  // Tests run without a page, so relative URLs need a base
  client.setConfig({ baseUrl: "http://localhost" });
  const fetch = vi.fn(
    async (request: Request) =>
      handler(request) ?? Response.json({ detail: "none" }, { status: 404 }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** Renders with a query client of its own, which doesn't retry. */
export function renderWithClient(ui: ReactNode): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return queryClient;
}

export const MIRA = {
  id: "0193f2c4-7c1e-7000-8000-000000000001",
  name: "Mira Kovalenko",
  email: "mira@acme.dev",
};
