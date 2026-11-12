import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { projectComponentsQueryKey } from "@/api/@tanstack/react-query.gen";
import type { ListedComponent } from "@/api/types.gen";
import { Toasts } from "@/components/ui/toast";
import { navigation } from "@/test-navigation";
import { stubApi } from "@/test-utils";
import { ComponentsPanel } from "./components-panel";

vi.mock("next/navigation", () =>
  import("@/test-navigation").then((m) => m.navigationMock),
);

afterEach(() => {
  vi.unstubAllGlobals();
});

const TEAM = { id: "t1", name: "Acme", url: "acme", role: "MEMBER" as const };
const PROJECT = {
  id: "p1",
  name: "Marketing site",
  url: "marketing-site",
  description: "",
  edited_at: "2026-11-12T10:00:00Z",
  role: "DEVELOPER" as const,
};
const BASE = "/api/teams/acme/projects/marketing-site/components";
const listed = (id: string, name: string): ListedComponent => ({
  id,
  name,
  updated_at: "2026-11-12T10:00:00Z",
});
const COMPONENTS = [
  listed("c1", "PricingCard"),
  listed("c2", "NavBar"),
  listed("c3", "FeatureGrid"),
];

function renderPanel(
  props: Partial<ComponentProps<typeof ComponentsPanel>> = {},
) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    projectComponentsQueryKey({
      path: { team_url: "acme", project_url: "marketing-site" },
    }),
    COMPONENTS.toReversed(),
  );
  const handlers = { onCreate: vi.fn(), onRetry: vi.fn() };
  render(
    <QueryClientProvider client={queryClient}>
      <Toasts>
        <ComponentsPanel
          team={TEAM}
          project={PROJECT}
          components={COMPONENTS}
          failed={false}
          openId="c1"
          creating={false}
          {...handlers}
          {...props}
        />
      </Toasts>
    </QueryClientProvider>,
  );
  return { queryClient, ...handlers };
}

const names = () =>
  within(screen.getByRole("list", { name: "Components" }))
    .getAllByRole("link")
    .map((link) => link.textContent);

function openMenu(name: string) {
  fireEvent.keyDown(
    screen.getByRole("button", { name: `Actions for ${name}` }),
    { key: "Enter" },
  );
}

test("the components link to their editors, and the open one is marked", () => {
  stubApi(() => undefined);
  renderPanel();

  expect(
    screen.getByRole("heading", { name: "Components 3" }),
  ).toBeInTheDocument();
  expect(names()).toEqual(["PricingCard", "NavBar", "FeatureGrid"]);
  const open = screen.getByRole("link", { name: "PricingCard" });
  expect(open).toHaveAttribute("aria-current", "page");
  expect(open).toHaveAttribute("href", "/acme/marketing-site/c1");
  expect(screen.getByRole("link", { name: "NavBar" })).not.toHaveAttribute(
    "aria-current",
  );
});

test("search finds components by part of their name, in any case", () => {
  stubApi(() => undefined);
  renderPanel();
  const search = screen.getByRole("textbox", { name: "Search components" });

  fireEvent.change(search, { target: { value: "  GRID " } });
  expect(names()).toEqual(["FeatureGrid"]);
  expect(screen.getByText("Grid", { selector: "mark" })).toBeInTheDocument();

  fireEvent.change(search, { target: { value: "zebra" } });
  expect(screen.getByText("No components found")).toBeInTheDocument();
  expect(screen.getByText("Nothing matches “zebra”.")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Clear search", { selector: "button" }));
  expect(names()).toHaveLength(3);

  // The field's own clear button, and Escape
  fireEvent.change(search, { target: { value: "nav" } });
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(search).toHaveValue("");
  fireEvent.change(search, { target: { value: "nav" } });
  fireEvent.keyDown(search, { key: "Escape" });
  expect(search).toHaveValue("");
});

test("while the components load, the list shows their shape", () => {
  stubApi(() => undefined);
  renderPanel({ components: undefined });

  expect(
    screen.getByRole("list", { name: "Loading components" }),
  ).toHaveAttribute("aria-busy", "true");
  expect(
    screen.getByRole("heading", { name: "Components" }),
  ).toBeInTheDocument();
});

test("a project without components says so, and New component creates one", () => {
  stubApi(() => undefined);
  const { onCreate } = renderPanel({ components: [], openId: undefined });

  expect(screen.getByText("No components yet")).toBeInTheDocument();
  expect(screen.getByText("Create one to start building.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "New component" }));
  expect(onCreate).toHaveBeenCalledOnce();
});

test("components that failed to load can be tried again", () => {
  stubApi(() => undefined);
  const { onRetry } = renderPanel({ components: undefined, failed: true });

  expect(screen.getByText("Couldn’t load components")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(onRetry).toHaveBeenCalledOnce();
});

test("the menu renames a component in its row", async () => {
  stubApi(() => undefined);
  renderPanel();

  openMenu("NavBar");
  const items = await screen.findAllByRole("menuitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "Rename",
    "Duplicate",
    "Delete",
  ]);
  fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));

  const field = await screen.findByRole("textbox", { name: "Component name" });
  expect(field).toHaveValue("NavBar");
  fireEvent.keyDown(field, { key: "Escape" });
  expect(screen.getByRole("link", { name: "NavBar" })).toBeInTheDocument();
});

test("duplicating says the copy's name, and Open opens it", async () => {
  const fetch = stubApi((request) =>
    request.method === "POST"
      ? Response.json(
          {
            ...listed("c4", "FeatureGridCopy"),
            graph: {},
            screen_sizes: [],
            version: 1,
          },
          { status: 201 },
        )
      : undefined,
  );
  renderPanel();

  openMenu("FeatureGrid");
  fireEvent.click(await screen.findByRole("menuitem", { name: "Duplicate" }));

  const title = await screen.findByText("FeatureGrid duplicated");
  const toast = title.closest("li") as HTMLElement;
  expect(toast).toHaveTextContent("The copy is FeatureGridCopy.");
  expect(fetch.mock.calls[0]?.[0].url).toBe(
    `http://localhost${BASE}/c3/copies`,
  );
  fireEvent.click(within(toast).getByRole("button", { name: "Open" }));
  expect(navigation.router.push).toHaveBeenCalledWith(
    "/acme/marketing-site/c4",
  );
});

test("deleting the open component asks first, then opens another", async () => {
  const fetch = stubApi((request) =>
    request.method === "DELETE"
      ? new Response(null, { status: 204 })
      : undefined,
  );
  const { queryClient } = renderPanel();

  openMenu("PricingCard");
  fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
  const dialog = await screen.findByRole("dialog", {
    name: "Delete PricingCard?",
  });
  expect(dialog).toHaveTextContent(
    "It’s deleted for everyone in Marketing site. This can’t be undone.",
  );
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Delete component" }),
  );

  expect(await screen.findByText("PricingCard deleted")).toBeInTheDocument();
  expect(fetch.mock.calls.map(([r]) => `${r.method} ${r.url}`)).toContain(
    `DELETE http://localhost${BASE}/c1`,
  );
  // Gone from the list at once, so nothing opens it again
  expect(
    queryClient
      .getQueryData<ListedComponent[]>(
        projectComponentsQueryKey({
          path: { team_url: "acme", project_url: "marketing-site" },
        }),
      )
      ?.map((component) => component.id),
  ).toEqual(["c3", "c2"]);
  expect(navigation.router.replace).toHaveBeenCalledWith(
    "/acme/marketing-site",
  );
});

test("deleting another component keeps the open one", async () => {
  stubApi((request) =>
    request.method === "DELETE"
      ? new Response(null, { status: 204 })
      : undefined,
  );
  renderPanel();

  openMenu("NavBar");
  fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Delete component" }),
  );

  expect(await screen.findByText("NavBar deleted")).toBeInTheDocument();
  expect(navigation.router.replace).not.toHaveBeenCalled();
});

test("a delete that fails says so, and keeps the dialog", async () => {
  stubApi(() => new Response(null, { status: 500 }));
  renderPanel();

  openMenu("NavBar");
  fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Delete component" }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "That didn’t work. Try again.",
  );
  expect(
    screen.getByRole("dialog", { name: "Delete NavBar?" }),
  ).toBeInTheDocument();
});

test("the list hides, and shows again", () => {
  stubApi(() => undefined);
  renderPanel();

  fireEvent.click(screen.getByRole("button", { name: "Hide components" }));
  expect(screen.queryByRole("list", { name: "Components" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show components" }));
  expect(names()).toHaveLength(3);
});

test("the new component button waits for the one being created", () => {
  stubApi(() => undefined);
  renderPanel({ creating: true });

  expect(screen.getByRole("button", { name: "New component" })).toBeDisabled();
});
