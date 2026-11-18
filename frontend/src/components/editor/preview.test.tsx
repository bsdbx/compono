import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderWithClient, stubApi } from "@/test-utils";
import type { Content, Draft } from "./draft";
import { Preview, toHtml } from "./preview";

const SIZES = [
  { name: "Desktop", width: 1280 },
  { name: "Tablet", width: 768 },
  { name: "Mobile", width: 390 },
];

/** A draft that takes the changes the Preview makes */
function fakeDraft(content: Content) {
  let snapshot = { status: "saved", content };
  const listeners = new Set<() => void>();
  const change = vi.fn((next: Content) =>
    act(() => {
      snapshot = { ...snapshot, content: next };
      for (const listener of listeners) {
        listener();
      }
    }),
  );
  const draft = {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    change,
  };
  return { draft: draft as unknown as Draft, change };
}

let answer: Record<string, unknown> = {};

beforeEach(() => {
  answer = { nodes: {}, wires: {}, rendered: null, milliseconds: 0.1 };
  stubApi((request) => {
    const path = new URL(request.url).pathname;
    if (path === "/api/evaluate") {
      return Response.json(answer);
    }

    if (path === "/api/node-types") {
      return Response.json([
        {
          type: "get-field",
          name: "Get Field",
          category: "Objects",
          single: false,
          properties: [],
          sockets: { inputs: [], groups: [], outputs: [] },
        },
      ]);
    }

    return undefined;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const content: Content = {
  graph: { nodes: [{ id: "n1", type: "get-field" }] },
  screen_sizes: SIZES,
};

test("an element renders as HTML, with its texts and attributes escaped", () => {
  expect(
    toHtml({
      tag: "a",
      key: null,
      className: "btn primary",
      attributes: {
        href: "/pricing?plan=pro&period=yr",
        title: 'Say "hi"',
        hidden: true,
        disabled: false,
        onclick: "steal()",
      },
      children: [
        "Get <started>",
        { tag: "img", className: "", attributes: { alt: "" }, children: [] },
        // A fragment is only its children
        { tag: "", className: "", attributes: {}, children: ["!", 2] },
      ],
    }),
  ).toBe(
    '<a class="btn primary" href="/pricing?plan=pro&amp;period=yr" title="Say &quot;hi&quot;" hidden>Get &lt;started&gt;<img alt="">!2</a>',
  );
  expect(toHtml(null)).toBe("");
});

test("a rendered component shows in a sandboxed frame at the first screen size", async () => {
  answer.rendered = {
    tag: "div",
    className: "card",
    attributes: {},
    children: ["Pro"],
  };
  const { draft } = fakeDraft(content);
  renderWithClient(<Preview draft={draft} onShowNode={() => {}} />);

  const frame = await screen.findByTitle("Preview");
  // Scripts run for Tailwind, but in a frame of its own origin
  expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  expect(frame.getAttribute("srcdoc")).toContain(
    "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3",
  );
  expect(frame).toHaveStyle({ width: "1280px" });
  expect(
    screen.getByRole("button", { name: "Screen size: Desktop 1280" }),
  ).toBeInTheDocument();
});

test("nodes in error keep it from rendering, and Show node shows the first", async () => {
  answer.nodes = {
    n1: {
      sockets: { inputs: [], groups: [], outputs: [] },
      outputs: {},
      error: "badge.tone no longer exists on plan.",
      skipped: false,
    },
    n2: {
      sockets: { inputs: [], groups: [], outputs: [] },
      outputs: {},
      error: "Tag can't be script",
      skipped: false,
    },
  };
  const onShowNode = vi.fn();
  const { draft } = fakeDraft(content);
  renderWithClient(<Preview draft={draft} onShowNode={onShowNode} />);

  expect(await screen.findByText("Can’t render")).toBeInTheDocument();
  expect(
    await screen.findByText(
      "Get Field: badge.tone no longer exists on plan. And 1 more.",
    ),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show node" }));
  expect(onShowNode).toHaveBeenCalledWith("n1");
});

test("with nothing rendered, the Preview shows only its empty state", async () => {
  const { draft } = fakeDraft(content);
  renderWithClient(<Preview draft={draft} onShowNode={() => {}} />);

  expect(await screen.findByText("Nothing to render yet")).toBeInTheDocument();
  expect(
    screen.queryByText("Wire an element into Component Output’s Render."),
  ).not.toBeInTheDocument();
});

async function openSizes() {
  fireEvent.pointerDown(screen.getByRole("button", { name: /Screen size/ }), {
    button: 0,
    ctrlKey: false,
  });
  return screen.findByRole("menu");
}

test("a component keeps its picked preview size after leaving and reopening, independently of other components", async () => {
  const { draft, change } = fakeDraft(content);
  renderWithClient(
    <Preview componentId="card-a" draft={draft} onShowNode={() => {}} />,
  );
  fireEvent.click(
    within(await openSizes()).getByRole("menuitem", { name: /Tablet/ }),
  );
  cleanup();
  renderWithClient(
    <Preview componentId="card-b" draft={draft} onShowNode={() => {}} />,
  );
  expect(
    screen.getByRole("button", { name: "Screen size: Desktop 1280" }),
  ).toBeInTheDocument();
  cleanup();
  renderWithClient(
    <Preview componentId="card-a" draft={draft} onShowNode={() => {}} />,
  );
  expect(
    screen.getByRole("button", { name: "Screen size: Tablet 768" }),
  ).toBeInTheDocument();
  expect(change).not.toHaveBeenCalled();
});

test("a screen size picks, adds and goes", async () => {
  answer.rendered = { tag: "div", className: "", attributes: {}, children: [] };
  const { draft, change } = fakeDraft(content);
  renderWithClient(<Preview draft={draft} onShowNode={() => {}} />);
  await screen.findByTitle("Preview");

  // Pick Tablet
  fireEvent.click(
    within(await openSizes()).getByRole("menuitem", { name: /Tablet/ }),
  );
  expect(screen.getByTitle("Preview")).toHaveStyle({ width: "768px" });

  // Add Wide, which it then shows at
  fireEvent.click(
    within(await openSizes()).getByRole("menuitem", { name: /Add size/ }),
  );
  const add = screen.getByRole("button", { name: "Add" });
  fireEvent.change(screen.getByLabelText("Size name"), {
    target: { value: "Tablet" },
  });
  fireEvent.change(screen.getByLabelText("Width"), {
    target: { value: "1440" },
  });
  // A name that's taken doesn't add
  expect(add).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Size name"), {
    target: { value: "Wide" },
  });
  fireEvent.click(add);
  expect(change).toHaveBeenLastCalledWith({
    graph: content.graph,
    screen_sizes: [...SIZES, { name: "Wide", width: 1440 }],
  });
  expect(screen.getByTitle("Preview")).toHaveStyle({ width: "1440px" });

  // Remove Mobile
  fireEvent.click(
    within(await openSizes()).getByRole("button", { name: "Remove Mobile" }),
  );
  expect(change).toHaveBeenLastCalledWith({
    graph: content.graph,
    screen_sizes: [SIZES[0], SIZES[1], { name: "Wide", width: 1440 }],
  });
});
