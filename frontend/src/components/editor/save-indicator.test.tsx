import { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Component } from "@/api/types";
import { Draft, SAVE_DELAY } from "./draft";
import { SaveIndicator } from "./save-indicator";

const PATH = { team_url: "acme", project_url: "site", component_id: "c1" };
const CARD: Component = {
  id: "c1",
  name: "PricingCard",
  graph: {},
  screen_sizes: [],
  version: 1,
  updated_at: "2026-11-18T10:00:00Z",
};
const CHANGED = { graph: { nodes: [] }, screen_sizes: [] };
let icon: HTMLLinkElement;

beforeEach(() => {
  vi.useFakeTimers();
  icon = document.createElement("link");
  icon.rel = "icon";
  icon.href = "/favicon.ico";
  document.head.append(icon);
});

afterEach(() => {
  icon.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function open() {
  const draft = new Draft(new QueryClient());
  draft.open(PATH, CARD);
  return draft;
}

async function save(draft: Draft) {
  act(() => draft.change(CHANGED));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SAVE_DELAY);
  });
}

test("a loaded, saved component uses the green favicon and accessible feedback", () => {
  render(<SaveIndicator draft={open()} />);
  expect(icon).toHaveAttribute("href", "/favicon-saved.svg");
  expect(icon).toHaveAttribute("type", "image/svg+xml");
  expect(icon).toHaveAttribute("sizes", "any");
  expect(screen.getByRole("status")).toHaveTextContent("Saved");
  expect(screen.getByRole("status")).toHaveClass("sr-only");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("the favicon stays orange through the debounce and the in-flight save", async () => {
  let finish: (response: Response) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const draft = open();
  render(<SaveIndicator draft={draft} />);

  act(() => draft.change(CHANGED));
  expect(icon).toHaveAttribute("href", "/favicon-pending.svg");
  expect(screen.getByRole("status")).toHaveTextContent("Saving…");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SAVE_DELAY);
  });
  expect(icon).toHaveAttribute("href", "/favicon-pending.svg");

  await act(async () => {
    finish(Response.json({ version: 2, updated_at: CARD.updated_at }));
  });
  expect(icon).toHaveAttribute("href", "/favicon-saved.svg");
  expect(screen.getByRole("status")).toHaveTextContent("Saved");
});

test("a failed save turns red and Retry sends it again", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(
      Response.json({ version: 2, updated_at: CARD.updated_at }),
    );
  vi.stubGlobal("fetch", fetch);
  const draft = open();
  render(<SaveIndicator draft={draft} />);
  await save(draft);

  expect(icon).toHaveAttribute("href", "/favicon-failed.svg");
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t save");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(icon).toHaveAttribute("href", "/favicon-saved.svg");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("a save conflict stays red until Reload loads the server's version", async () => {
  const theirs = { ...CARD, version: 3, graph: { nodes: [{ id: "new" }] } };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ detail: "version_conflict" }, { status: 409 }),
    )
    .mockResolvedValueOnce(Response.json(theirs));
  vi.stubGlobal("fetch", fetch);
  const draft = open();
  render(<SaveIndicator draft={draft} />);
  await save(draft);

  expect(icon).toHaveAttribute("href", "/favicon-failed.svg");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Someone else saved this component",
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
  });
  expect(icon).toHaveAttribute("href", "/favicon-saved.svg");
  expect(draft.getSnapshot().content?.graph).toEqual(theirs.graph);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("a failed Reload keeps the conflict notice and the red favicon", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ detail: "version_conflict" }, { status: 409 }),
      )
      .mockRejectedValueOnce(new TypeError("Failed to fetch")),
  );
  const draft = open();
  render(<SaveIndicator draft={draft} />);
  await save(draft);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
  });
  expect(icon).toHaveAttribute("href", "/favicon-failed.svg");
  expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  expect(draft.unsaved()).toBe(true);
});

test("closing a component restores the normal logo without reporting an empty draft as saved", () => {
  const draft = open();
  render(<SaveIndicator draft={draft} />);
  act(() => draft.close());
  expect(icon).toHaveAttribute("href", "/favicon.ico");
  expect(icon).not.toHaveAttribute("type");
  expect(icon).not.toHaveAttribute("sizes");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("leaving the editor restores the favicon and its original attributes, even while saving", () => {
  icon.type = "image/x-icon";
  icon.setAttribute("sizes", "16x16 32x32");
  const draft = open();
  const { unmount } = render(<SaveIndicator draft={draft} />);
  act(() => draft.change(CHANGED));
  unmount();
  expect(icon).toHaveAttribute("href", "/favicon.ico");
  expect(icon).toHaveAttribute("type", "image/x-icon");
  expect(icon).toHaveAttribute("sizes", "16x16 32x32");
});

test("a project with no component keeps the normal logo", () => {
  render(<SaveIndicator draft={new Draft(new QueryClient())} />);
  expect(icon).toHaveAttribute("href", "/favicon.ico");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
