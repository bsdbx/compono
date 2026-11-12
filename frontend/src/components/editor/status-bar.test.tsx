import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
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

const graph = (count: number): Content => ({
  graph: { nodes: Array.from({ length: count }, (_, i) => ({ id: `n${i}` })) },
  screen_sizes: [],
});

test("the bar counts the open component's nodes, and shows Compono's version", () => {
  const { draft } = fakeDraft(graph(9));
  render(<StatusBar draft={draft} />);

  expect(screen.getByText("9 nodes")).toBeInTheDocument();
  expect(screen.getByText("v0.1.0")).toBeInTheDocument();
});

test("one node, and none when nothing is open or the graph is new", () => {
  const one = fakeDraft(graph(1));
  const { unmount } = render(<StatusBar draft={one.draft} />);
  expect(screen.getByText("1 node")).toBeInTheDocument();
  unmount();

  render(
    <StatusBar draft={fakeDraft({ graph: {}, screen_sizes: [] }).draft} />,
  );
  expect(screen.getByText("0 nodes")).toBeInTheDocument();
});

test("the bar says whether the work is saved, and offers what to do when it isn't", () => {
  const { draft, set, retry, reload } = fakeDraft(graph(2));
  render(<StatusBar draft={draft} />);
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
