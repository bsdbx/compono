import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { renderWithClient, stubApi } from "@/test-utils";
import { CodeView } from "./code-view";
import type { Content, Draft } from "./draft";

const CODE = `export default function PricingCard({ title = "Pro" }) {
  return (
    <h3>{title}</h3>
  );
}
`;

let answer: Record<string, unknown> = {};
let fetch: ReturnType<typeof stubApi>;

beforeEach(() => {
  answer = { filename: "PricingCard.jsx", code: CODE, errors: [] };
  fetch = stubApi((request) =>
    new URL(request.url).pathname === "/api/code"
      ? Response.json(answer)
      : undefined,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

const content: Content = {
  graph: {
    nodes: [{ id: "title", type: "element", position: { x: 0, y: 0 } }],
  },
  screen_sizes: [],
};

function draft(): Draft {
  // One snapshot, as a draft keeps until it changes
  const snapshot = { status: "saved", content };
  return {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
  } as unknown as Draft;
}

test("the component shows as its JSX file, a numbered line at a time", async () => {
  renderWithClient(<CodeView draft={draft()} name="Pricing card" />);

  const code = await screen.findByRole("region", { name: "Code" });
  expect(within(code).getByRole("heading")).toHaveTextContent(
    "PricingCard.jsx",
  );
  expect(code).toHaveTextContent("1export default function PricingCard");
  expect(code).toHaveTextContent("5}");
  // What it asked for: the component's name and its graph, without where its nodes are
  const asked = fetch.mock.calls.find(([r]) =>
    r.url.endsWith("/api/code"),
  )?.[0];
  expect(await asked?.json()).toMatchObject({
    name: "Pricing card",
    graph: { nodes: [{ id: "title", type: "element" }] },
  });
});

test("Copy puts the code on the clipboard", async () => {
  const writeText = vi.fn(async () => {});
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  renderWithClient(<CodeView draft={draft()} name="PricingCard" />);

  fireEvent.click(await screen.findByRole("button", { name: "Copy" }));
  expect(writeText).toHaveBeenCalledWith(CODE);
  expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
});

test("Download saves the code as its file", async () => {
  // jsdom has no object URLs
  const urls: Blob[] = [];
  Object.assign(URL, {
    createObjectURL: (blob: Blob) => {
      urls.push(blob);
      return "blob:code";
    },
    revokeObjectURL: () => {},
  });
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  renderWithClient(<CodeView draft={draft()} name="PricingCard" />);

  fireEvent.click(await screen.findByRole("button", { name: "Download" }));
  const link = click.mock.contexts[0] as HTMLAnchorElement;
  expect(link.download).toBe("PricingCard.jsx");
  expect(link.href).toBe("blob:code");
  expect(await urls[0]?.text()).toBe(CODE);
});

test("a component with a node in error says why it isn't code yet", async () => {
  answer = {
    filename: "PricingCard.jsx",
    code: null,
    errors: ["Element: There's no h7 tag"],
  };
  renderWithClient(<CodeView draft={draft()} name="PricingCard" />);

  expect(
    await screen.findByText("Can’t write the code yet"),
  ).toBeInTheDocument();
  expect(screen.getByText("Element: There's no h7 tag")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
});
