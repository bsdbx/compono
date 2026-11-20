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
    screen.getByRole("button", { name: "Screen size: Desktop 1280 × 720" }),
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
  const current = screen.queryByRole("menu", { name: "Screen sizes" });
  if (current?.getAttribute("data-state") === "open") return current;
  fireEvent.pointerDown(screen.getByRole("button", { name: /Screen size/ }), {
    button: 0,
    ctrlKey: false,
  });
  return screen.findByRole("menu", { name: "Screen sizes" });
}

async function sizeActions(name: string) {
  fireEvent.contextMenu(
    within(await openSizes()).getByRole("menuitem", { name: new RegExp(name) }),
  );
  return screen.findByRole("menuitem", { name: "Edit" });
}

test("right-clicking a preview size keeps the sizes list open behind its actions", async () => {
  const { draft } = fakeDraft(content);
  renderWithClient(<Preview draft={draft} onShowNode={() => {}} />);
  const edit = await sizeActions("Desktop");
  // The action menu covers the row under the pointer; leaving it must not steal focus.
  fireEvent.pointerLeave(screen.getByRole("menuitem", { name: /Desktop/ }), {
    pointerType: "mouse",
    relatedTarget: edit,
  });
  expect(edit).toBeVisible();
  expect(screen.getByRole("menuitem", { name: /Tablet/ })).toBeVisible();
  expect(screen.getByRole("menuitem", { name: /Mobile/ })).toBeVisible();
  expect(screen.getAllByRole("menu")).toHaveLength(2);
});

test("the current size is highlighted without a checkmark and can be deleted", async () => {
  const { draft, change } = fakeDraft(content);
  renderWithClient(
    <Preview componentId="card" draft={draft} onShowNode={() => {}} />,
  );
  const menu = await openSizes();
  const current = within(menu).getByRole("menuitem", { name: /Desktop/ });
  expect(current).toHaveAttribute("aria-current", "true");
  expect(current).toHaveClass("bg-accent");
  expect(current.querySelector(".lucide-check")).toBeNull();
  fireEvent.contextMenu(current);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
  expect(change).toHaveBeenLastCalledWith({
    graph: content.graph,
    screen_sizes: SIZES.slice(1),
  });
  expect(
    screen.getByRole("button", { name: "Screen size: Tablet 768 × 1024" }),
  ).toBeInTheDocument();
  expect(localStorage.getItem("compono:preview:card")).toBe("Tablet");
});

test("editing the selected size saves its name and width and remembers the renamed selection", async () => {
  const { draft, change } = fakeDraft(content);
  renderWithClient(
    <Preview componentId="card" draft={draft} onShowNode={() => {}} />,
  );
  fireEvent.click(await sizeActions("Desktop"));
  const dialog = await screen.findByRole("dialog", {
    name: "Edit preview size",
  });
  const name = within(dialog).getByLabelText("Size name");
  expect(name).toHaveFocus();
  expect(name).toHaveValue("Desktop");
  expect(within(dialog).getByLabelText("Width")).toHaveValue("1280");
  expect(within(dialog).getByLabelText("Height")).toHaveValue("720");
  fireEvent.change(name, { target: { value: "tAbLeT" } });
  expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  fireEvent.change(name, { target: { value: "  Desktop XL  " } });
  fireEvent.change(within(dialog).getByLabelText("Width"), {
    target: { value: "199" },
  });
  expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("Width"), {
    target: { value: "1440" },
  });
  fireEvent.change(within(dialog).getByLabelText("Height"), {
    target: { value: "900" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  expect(change).toHaveBeenLastCalledWith({
    graph: content.graph,
    screen_sizes: [
      { name: "Desktop XL", width: 1440, height: 900 },
      ...SIZES.slice(1),
    ],
  });
  expect(
    screen.getByRole("button", { name: "Screen size: Desktop XL 1440 × 900" }),
  ).toBeInTheDocument();
  expect(localStorage.getItem("compono:preview:card")).toBe("Desktop XL");
});

test("editing another size preserves the selection and unchanged edits do not save", async () => {
  const { draft, change } = fakeDraft(content);
  renderWithClient(<Preview draft={draft} onShowNode={() => {}} />);
  fireEvent.click(await sizeActions("Tablet"));
  fireEvent.click(await screen.findByRole("button", { name: "Save" }));
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(await sizeActions("Tablet"));
  fireEvent.change(screen.getByLabelText("Width"), {
    target: { value: "820" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(change).toHaveBeenLastCalledWith({
    graph: content.graph,
    screen_sizes: [
      SIZES[0],
      { name: "Tablet", width: 820, height: 1024 },
      SIZES[2],
    ],
  });
  expect(
    screen.getByRole("button", { name: "Screen size: Desktop 1280 × 720" }),
  ).toBeInTheDocument();
});

test("the final remaining size can be edited and cannot be deleted", async () => {
  const { draft, change } = fakeDraft({
    ...content,
    screen_sizes: SIZES.slice(0, 1),
  });
  renderWithClient(<Preview draft={draft} onShowNode={() => {}} />);
  const edit = await sizeActions("Desktop");
  expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveAttribute(
    "data-disabled",
  );
  fireEvent.click(edit);
  fireEvent.change(screen.getByLabelText("Width"), {
    target: { value: "1920" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(change).toHaveBeenLastCalledWith({
    graph: content.graph,
    screen_sizes: [{ name: "Desktop", width: 1920, height: 720 }],
  });
});

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
    screen.getByRole("button", { name: "Screen size: Desktop 1280 × 720" }),
  ).toBeInTheDocument();
  cleanup();
  renderWithClient(
    <Preview componentId="card-a" draft={draft} onShowNode={() => {}} />,
  );
  expect(
    screen.getByRole("button", { name: "Screen size: Tablet 768 × 1024" }),
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
    screen_sizes: [...SIZES, { name: "Wide", width: 1440, height: 720 }],
  });
  expect(screen.getByTitle("Preview")).toHaveStyle({ width: "1440px" });

  // Remove Mobile
  await sizeActions("Mobile");
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  expect(change).toHaveBeenLastCalledWith({
    graph: content.graph,
    screen_sizes: [
      SIZES[0],
      SIZES[1],
      { name: "Wide", width: 1440, height: 720 },
    ],
  });
});

test("preview zoom defaults to 100% and changes scale independently of the selected width and saved content", async () => {
  answer.rendered = {
    tag: "button",
    className: "",
    attributes: {},
    children: ["Compono"],
  };
  const { draft, change } = fakeDraft(content);
  renderWithClient(<Preview draft={draft} onShowNode={() => {}} />);
  const frame = await screen.findByTitle("Preview");
  expect(frame).toHaveStyle({ width: "1280px", height: "720px" });
  expect(frame.parentElement).toHaveStyle({ transform: "scale(1)" });
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "Preview zoom: 100%" }),
    { button: 0, ctrlKey: false },
  );
  const zooms = await screen.findByRole("menu");
  expect(within(zooms).getByRole("menuitem", { name: "100%" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  fireEvent.click(within(zooms).getByRole("menuitem", { name: "200%" }));
  expect(frame).toHaveStyle({ width: "1280px", height: "720px" });
  expect(frame.parentElement).toHaveStyle({ transform: "scale(2)" });
  fireEvent.click(
    within(await openSizes()).getByRole("menuitem", { name: /Tablet/ }),
  );
  expect(frame).toHaveStyle({ width: "768px", height: "1024px" });
  expect(frame.parentElement).toHaveStyle({ transform: "scale(2)" });
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "Preview zoom: 200%" }),
    { button: 0, ctrlKey: false },
  );
  fireEvent.click(
    within(await screen.findByRole("menu")).getByRole("menuitem", {
      name: "Fit",
    }),
  );
  expect(
    screen.getByRole("button", { name: "Preview zoom: Fit" }),
  ).toBeInTheDocument();
  expect(frame).toHaveStyle({ width: "768px" });
  expect(change).not.toHaveBeenCalled();
});

test("preview shortcuts stay in the preview and preserve text editing", async () => {
  answer.rendered = {
    tag: "button",
    className: "",
    attributes: {},
    children: ["Compono"],
  };
  const { draft } = fakeDraft(content);
  renderWithClient(<Preview draft={draft} onShowNode={() => {}} />);
  const surface = await screen.findByRole("region", {
    name: "Preview viewport",
  });
  const other = vi.fn();
  window.addEventListener("keydown", other);
  try {
    expect(fireEvent.keyDown(surface, { key: "f" })).toBe(false);
    expect(other).not.toHaveBeenCalled();
    expect(fireEvent.wheel(surface, { ctrlKey: true, deltaY: -100 })).toBe(
      false,
    );
    expect(
      screen.getByRole("button", { name: "Preview zoom: 122%" }),
    ).toBeInTheDocument();
    expect(
      fireEvent.wheel(document.body, { ctrlKey: true, deltaY: -100 }),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Preview zoom: 122%" }),
    ).toBeInTheDocument();
    fireEvent.click(await sizeActions("Desktop"));
    expect(
      fireEvent.keyDown(screen.getByLabelText("Size name"), { key: "f" }),
    ).toBe(true);
  } finally {
    window.removeEventListener("keydown", other);
  }
});
