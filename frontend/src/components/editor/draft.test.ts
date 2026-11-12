import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { componentQueryKey } from "@/api/@tanstack/react-query.gen";
import { client } from "@/api/client.gen";
import type { Component } from "@/api/types.gen";
import { type Content, Draft, SAVE_DELAY } from "./draft";

const PATH = {
  team_url: "acme",
  project_url: "marketing-site",
  component_id: "c1",
};
const BASE =
  "http://localhost/api/teams/acme/projects/marketing-site/components";
const SIZES = [{ name: "Desktop", width: 1280 }];
const CARD: Component = {
  id: "c1",
  name: "PricingCard",
  graph: {},
  screen_sizes: SIZES,
  version: 3,
  updated_at: "2026-11-12T10:00:00Z",
};

/** A graph of that many nodes */
function nodes(count: number): Content {
  return {
    graph: {
      nodes: Array.from({ length: count }, (_, i) => ({ id: `n${i}` })),
    },
    screen_sizes: SIZES,
  };
}

type Save = { url: string; body: { version: number } & Content };

/** Answers each request with the next answer, and keeps the saves it was sent. */
function answer(...answers: Array<() => Response | Promise<Response>>) {
  client.setConfig({ baseUrl: "http://localhost" });
  const saves: Save[] = [];
  const fetch = vi.fn(async (request: Request) => {
    if (request.method === "PUT") {
      saves.push({ url: request.url, body: await request.json() });
    }
    const next = answers.shift();
    if (next === undefined) {
      throw new Error(`Nothing to answer ${request.method} ${request.url}`);
    }
    return next();
  });
  vi.stubGlobal("fetch", fetch);
  return { saves, fetch };
}

const saved = (version: number) => () =>
  Response.json({ version, updated_at: "2026-11-12T11:00:00Z" });

function open() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(componentQueryKey({ path: PATH }), CARD);
  const draft = new Draft(queryClient);
  draft.open(PATH, CARD);
  return { draft, queryClient };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("changes save once they stop for a moment, from the version that was opened", async () => {
  const { saves } = answer(saved(4), saved(5));
  const { draft, queryClient } = open();

  draft.change(nodes(1));
  draft.change(nodes(2));
  expect(draft.getSnapshot()).toEqual({ status: "saving", content: nodes(2) });
  expect(draft.unsaved()).toBe(true);
  await vi.advanceTimersByTimeAsync(SAVE_DELAY - 1);
  expect(saves).toEqual([]);

  await vi.advanceTimersByTimeAsync(1);
  await vi.waitFor(() => expect(draft.getSnapshot().status).toBe("saved"));
  expect(saves).toEqual([
    { url: `${BASE}/c1/content`, body: { version: 3, ...nodes(2) } },
  ]);
  expect(draft.unsaved()).toBe(false);
  // What's loaded is what's saved
  expect(
    queryClient.getQueryData<Component>(componentQueryKey({ path: PATH })),
  ).toMatchObject({ version: 4, ...nodes(2) });

  // The next save starts from the version this one made
  draft.change(nodes(3));
  await vi.advanceTimersByTimeAsync(SAVE_DELAY);
  await vi.waitFor(() => expect(draft.getSnapshot().status).toBe("saved"));
  expect(saves[1]?.body.version).toBe(4);
});

test("a change made while a save is on its way is saved after it", async () => {
  let finish: () => void = () => {};
  const { saves } = answer(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(saved(4)());
      }),
    saved(5),
  );
  const { draft } = open();

  draft.change(nodes(1));
  await vi.advanceTimersByTimeAsync(SAVE_DELAY);
  draft.change(nodes(2));
  await vi.advanceTimersByTimeAsync(SAVE_DELAY);
  // One save at a time, so they can't arrive out of order
  expect(saves).toHaveLength(1);

  finish();
  await vi.waitFor(() => expect(saves).toHaveLength(2));
  expect(saves[1]?.body).toEqual({ version: 4, ...nodes(2) });
  await vi.waitFor(() => expect(draft.getSnapshot().status).toBe("saved"));
});

test("a save that fails says so, and Retry sends it again", async () => {
  const { saves } = answer(
    () => new Response(null, { status: 500 }),
    () => {
      throw new TypeError("Failed to fetch");
    },
    saved(4),
  );
  const { draft } = open();

  draft.change(nodes(1));
  await vi.advanceTimersByTimeAsync(SAVE_DELAY);
  await vi.waitFor(() => expect(draft.getSnapshot().status).toBe("failed"));
  expect(draft.unsaved()).toBe(true);

  // Offline
  draft.retry();
  await vi.waitFor(() => expect(saves).toHaveLength(2));
  await vi.waitFor(() => expect(draft.getSnapshot().status).toBe("failed"));

  draft.retry();
  await vi.waitFor(() => expect(draft.getSnapshot().status).toBe("saved"));
  expect(saves.map((save) => save.body)).toEqual([
    { version: 3, ...nodes(1) },
    { version: 3, ...nodes(1) },
    { version: 3, ...nodes(1) },
  ]);
});

test("after someone else saved, changes wait for Reload, which loads their version", async () => {
  const theirs = { ...CARD, version: 7, graph: nodes(5).graph };
  const { saves } = answer(
    () => Response.json({ detail: "version_conflict" }, { status: 409 }),
    () => Response.json(theirs),
    saved(8),
  );
  const { draft } = open();

  draft.change(nodes(1));
  await vi.advanceTimersByTimeAsync(SAVE_DELAY);
  await vi.waitFor(() => expect(draft.getSnapshot().status).toBe("conflict"));
  draft.change(nodes(2));
  draft.retry();
  await vi.advanceTimersByTimeAsync(SAVE_DELAY * 3);
  // Saving again would only conflict again
  expect(saves).toHaveLength(1);
  expect(draft.getSnapshot()).toEqual({
    status: "conflict",
    content: nodes(2),
  });

  await draft.reload();
  expect(draft.getSnapshot()).toEqual({ status: "saved", content: nodes(5) });
  draft.change(nodes(6));
  await vi.advanceTimersByTimeAsync(SAVE_DELAY);
  await vi.waitFor(() => expect(saves).toHaveLength(2));
  expect(saves[1]?.body.version).toBe(7);
});

test("opening another component sends what the last one hadn't saved", async () => {
  const { saves } = answer(saved(4));
  const { draft } = open();

  draft.change(nodes(1));
  draft.open(
    { ...PATH, component_id: "c2" },
    { ...CARD, id: "c2", version: 1 },
  );

  await vi.waitFor(() => expect(saves).toHaveLength(1));
  expect(saves[0]).toEqual({
    url: `${BASE}/c1/content`,
    body: { version: 3, ...nodes(1) },
  });
  expect(draft.getSnapshot()).toEqual({
    status: "saved",
    content: { graph: {}, screen_sizes: SIZES },
  });
  // Nothing more to save
  await vi.advanceTimersByTimeAsync(SAVE_DELAY * 2);
  expect(saves).toHaveLength(1);
});

test("opening the same component again keeps its changes", () => {
  answer();
  const { draft } = open();

  draft.change(nodes(2));
  draft.open(PATH, { ...CARD, version: 4 });

  expect(draft.getSnapshot()).toEqual({ status: "saving", content: nodes(2) });
});
