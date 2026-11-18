import { afterEach, expect, test, vi } from "vitest";
import { currentAccount, signIn, signOut, team } from "./client";

afterEach(() => vi.unstubAllGlobals());

test("API calls stay on the page's origin and use its session cookie", async () => {
  const fetch = vi.fn(async (_request: Request) =>
    Response.json({ id: "mira" }),
  );
  vi.stubGlobal("fetch", fetch);
  await signIn({ body: { email: "mira@acme.dev", password: "secret" } });
  const request = fetch.mock.calls[0]?.[0];
  expect(request?.url).toBe(`${window.location.origin}/api/sessions`);
  expect(request?.credentials).toBe("same-origin");
  expect(request?.method).toBe("POST");
  expect(request?.headers.get("Content-Type")).toBe("application/json");
  expect(await request?.json()).toEqual({
    email: "mira@acme.dev",
    password: "secret",
  });
});

test("signing out accepts an empty response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 204 })),
  );
  expect(await signOut()).toEqual({ data: undefined });
});

test("forms receive API validation details and queries can throw them", async () => {
  const error = { detail: "expired" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(error, { status: 401 })),
  );
  expect(await currentAccount()).toEqual({ error });
  await expect(currentAccount({ throwOnError: true })).rejects.toEqual(error);
});

test("a proxy's HTML error remains a failed request", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("<html>Unavailable</html>", {
          status: 502,
          statusText: "Bad Gateway",
        }),
    ),
  );
  expect(await currentAccount()).toEqual({ error: { detail: "Bad Gateway" } });
});

test("canceling a query cancels the underlying request", async () => {
  const controller = new AbortController();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (request: Request) =>
        new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    ),
  );
  const pending = currentAccount({ signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toHaveProperty("name", "AbortError");
});

test("path parameters cannot change the endpoint or add a query string", async () => {
  const fetch = vi.fn(async (_request: Request) => Response.json({}));
  vi.stubGlobal("fetch", fetch);
  await team({ path: { team_url: "acme/other?owner=true" } });
  expect(fetch.mock.calls[0]?.[0].url).toBe(
    `${window.location.origin}/api/teams/acme%2Fother%3Fowner%3Dtrue`,
  );
});
