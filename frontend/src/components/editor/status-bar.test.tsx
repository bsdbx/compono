import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderWithClient, stubApi } from "@/test-utils";
import type { Content, Draft, SaveStatus } from "./draft";
import { StatusBar } from "./status-bar";

/** A draft whose status the test sets */
function fakeDraft(content: Content | undefined) {
  let snapshot = { status: "saved" as SaveStatus, content };
  const listeners = new Set<() => void>();
  const draft = {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    retry: vi.fn(),
    reload: vi.fn(async () => {}),
  };
  const set = (status: SaveStatus) =>
    act(() => {
      snapshot = { ...snapshot, status };
      for (const listener of listeners) {
        listener();
      }
    });
  return {
    draft: draft as unknown as Draft,
    retry: draft.retry,
    reload: draft.reload,
    set,
  };
}

let evaluated: {
  nodes: Record<string, unknown>;
  wires: Record<string, string>;
} = {
  nodes: {},
  wires: {},
};

beforeEach(() => {
  evaluated = { nodes: {}, wires: {} };
  stubApi((request) =>
    new URL(request.url).pathname === "/api/evaluate"
      ? Response.json({ ...evaluated, rendered: null, milliseconds: 0.42 })
      : undefined,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const graph = (count: number): Content => ({
  graph: { nodes: Array.from({ length: count }, (_, i) => ({ id: `n${i}` })) },
  screen_sizes: [],
});

test("the bar counts the open component's nodes, and shows Compono's version", () => {
  const { draft } = fakeDraft(graph(9));
  renderWithClient(<StatusBar draft={draft} />);

  expect(screen.getByText("9 nodes")).toBeInTheDocument();
  expect(screen.getByText("v0.1.0")).toBeInTheDocument();
});

test("one node, and none when nothing is open or the graph is new", () => {
  const one = fakeDraft(graph(1));
  renderWithClient(<StatusBar draft={one.draft} />);
  expect(screen.getByText("1 node")).toBeInTheDocument();
  cleanup();

  renderWithClient(
    <StatusBar draft={fakeDraft({ graph: {}, screen_sizes: [] }).draft} />,
  );
  expect(screen.getByText("0 nodes")).toBeInTheDocument();
});

test("the bar says whether the work is saved, and offers what to do when it isn't", () => {
  const { draft, set, retry, reload } = fakeDraft(graph(2));
  renderWithClient(<StatusBar draft={draft} />);
  const status = screen.getByRole("status");

  expect(status).toHaveTextContent("Saved");
  set("saving");
  expect(status).toHaveTextContent("Saving…");
  set("failed");
  expect(status).toHaveTextContent("Couldn’t save");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(retry).toHaveBeenCalledOnce();
  set("conflict");
  expect(status).toHaveTextContent("Someone else saved this component");
  fireEvent.click(screen.getByRole("button", { name: "Reload" }));
  expect(reload).toHaveBeenCalledOnce();
});

test("once the graph is evaluated, the bar says how long that took, and how many errors there are", async () => {
  evaluated = {
    nodes: {
      broken: {
        sockets: { inputs: [], groups: [], outputs: [] },
        outputs: {},
        error: "badge.tone no longer exists",
        skipped: false,
      },
      script: {
        sockets: { inputs: [], groups: [], outputs: [] },
        outputs: {},
        error: "Tag can't be script",
        skipped: false,
      },
      fine: {
        sockets: { inputs: [], groups: [], outputs: [] },
        outputs: {},
        error: null,
        skipped: false,
      },
    },
    // A refused wire is red on the canvas, not an error
    wires: { w1: "Text can't go into Number" },
  };
  const { draft } = fakeDraft(graph(3));
  renderWithClient(<StatusBar draft={draft} />);

  expect(await screen.findByText("Eval 0.4 ms")).toBeInTheDocument();
  expect(screen.getByText("2 errors")).toBeInTheDocument();
});

test("without errors, the bar doesn't mention them", async () => {
  const { draft } = fakeDraft(graph(1));
  renderWithClient(<StatusBar draft={draft} />);

  expect(await screen.findByText("Eval 0.4 ms")).toBeInTheDocument();
  expect(screen.queryByText(/error/)).toBeNull();
});
