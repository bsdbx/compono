import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { navigation } from "@/test-navigation";
import { Boundary, MIRA, renderWithClient, stubApi } from "@/test-utils";
import { Editor } from "./editor";

vi.mock("@/lib/navigation", () =>
  import("@/test-navigation").then((m) => m.navigationMock),
);

let icon: HTMLLinkElement;

beforeEach(() => {
  navigation.params = { team: "acme", project: "marketing-site" };
  icon = document.createElement("link");
  icon.rel = "icon";
  icon.href = "/favicon.ico";
  document.head.append(icon);
});

afterEach(() => {
  icon.remove();
  vi.unstubAllGlobals();
});

const PROJECT = "/api/teams/acme/projects/marketing-site";
const listed = (id: string, name: string) => ({
  id,
  name,
  updated_at: "2026-11-12T10:00:00Z",
});
const component = (id: string, name: string, nodes = 0) => ({
  ...listed(id, name),
  graph: { nodes: Array.from({ length: nodes }, (_, i) => ({ id: `n${i}` })) },
  screen_sizes: [{ name: "Desktop", width: 1280 }],
  version: 1,
});

/** The API of Acme's Marketing site, with these components, oldest first, and more answers */
function answer(
  components: ReturnType<typeof listed>[],
  more: Record<string, (request: Request) => Response> = {},
) {
  return stubApi((request) => {
    const route = `${request.method} ${new URL(request.url).pathname}`;
    const routes: Record<string, () => Response> = {
      "GET /api/account": () => Response.json(MIRA),
      "GET /api/teams/acme": () =>
        Response.json({ id: "t1", name: "Acme", url: "acme", role: "OWNER" }),
      [`GET ${PROJECT}`]: () =>
        Response.json({
          id: "p1",
          name: "Marketing site",
          url: "marketing-site",
          description: "",
          edited_at: "2026-11-12T10:00:00Z",
          role: "LEAD",
        }),
      [`GET ${PROJECT}/components`]: () => Response.json(components),
    };
    return (more[route] ?? routes[route])?.(request);
  });
}

test("opening a project opens its newest component", async () => {
  answer([listed("c1", "NavBar"), listed("c2", "PricingCard")]);
  renderWithClient(<Editor />);

  await waitFor(() =>
    expect(navigation.router.replace).toHaveBeenCalledWith(
      "/acme/marketing-site/c2",
    ),
  );
  // Newest first
  const list = await screen.findByRole("list", { name: "Components" });
  expect(
    within(list)
      .getAllByRole("link")
      .map((link) => link.textContent),
  ).toEqual(["PricingCard", "NavBar"]);
});

test("the open component shows where it is and saved feedback without a status bar", async () => {
  navigation.params.component = "c2";
  answer([listed("c1", "NavBar"), listed("c2", "PricingCard")], {
    [`GET ${PROJECT}/components/c2`]: () =>
      Response.json(component("c2", "PricingCard", 9)),
    "POST /api/evaluate": () =>
      Response.json({
        nodes: {},
        wires: {},
        rendered: null,
        milliseconds: 0.1,
      }),
  });
  renderWithClient(<Editor />);

  const breadcrumb = await screen.findByRole("navigation", {
    name: "Breadcrumb",
  });
  await waitFor(() =>
    expect(breadcrumb).toHaveTextContent("AcmeMarketing sitePricingCard"),
  );
  expect(
    within(breadcrumb).getByRole("link", { name: "Acme" }),
  ).toHaveAttribute("href", "/acme");
  expect(
    within(breadcrumb).getByRole("link", { name: "Marketing site" }),
  ).toHaveAttribute("href", "/acme/marketing-site");
  await waitFor(() =>
    expect(icon).toHaveAttribute("href", "/favicon-saved.svg"),
  );
  expect(screen.getByRole("status")).toHaveTextContent("Saved");
  expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  expect(screen.queryByText("9 nodes")).not.toBeInTheDocument();
  expect(screen.queryByText("v0.1.0")).not.toBeInTheDocument();
  // Once the graph is evaluated
  expect(await screen.findByText("Nothing to render yet")).toBeInTheDocument();
  expect(
    screen.getByText("Select a node to edit its properties."),
  ).toBeInTheDocument();
  expect(navigation.router.replace).not.toHaveBeenCalled();

  // Its name renames it
  fireEvent.click(screen.getByRole("button", { name: "Rename PricingCard" }));
  expect(screen.getByRole("textbox", { name: "Component name" })).toHaveValue(
    "PricingCard",
  );
});

test("a project without components offers to create the first, and opens it to name", async () => {
  const fetch = answer([], {
    [`POST ${PROJECT}/components`]: () =>
      Response.json(component("c9", "Untitled"), { status: 201 }),
  });
  renderWithClient(<Editor />);

  expect(await screen.findByText("No component open")).toBeInTheDocument();
  expect(
    screen.getByText("Create a component to start building."),
  ).toBeInTheDocument();
  fireEvent.click(
    within(screen.getByRole("main")).getByRole("button", {
      name: "New component",
    }),
  );

  await waitFor(() =>
    expect(navigation.router.push).toHaveBeenCalledWith(
      "/acme/marketing-site/c9",
    ),
  );
  const create = fetch.mock.calls.find(([r]) => r.method === "POST")?.[0];
  expect(await create?.json()).toEqual({});
  expect(navigation.router.replace).not.toHaveBeenCalled();
});

test("a component that isn't there goes back to the project", async () => {
  navigation.params.component = "gone";
  answer([listed("c1", "NavBar")], {
    [`GET ${PROJECT}/components/gone`]: () =>
      Response.json({ detail: "component_not_found" }, { status: 404 }),
  });
  renderWithClient(<Editor />);

  await waitFor(() =>
    expect(navigation.router.replace).toHaveBeenCalledWith(
      "/acme/marketing-site",
    ),
  );
});

test("panel dividers resize their areas and the library restores its width after collapsing", async () => {
  answer([]);
  renderWithClient(<Editor />);
  const library = await screen.findByRole("complementary", {
    name: "Components",
  });
  const inspector = screen.getByRole("complementary", { name: "Inspector" });
  const left = screen.getByRole("separator", {
    name: "Resize component library",
  });
  const right = screen.getByRole("separator", { name: "Resize inspector" });
  const preview = screen.getByRole("separator", { name: "Resize preview" });

  fireEvent.keyDown(left, { key: "ArrowRight", shiftKey: true });
  expect(library).toHaveStyle({ width: "264px" });
  fireEvent.click(screen.getByRole("button", { name: "Hide components" }));
  expect(
    screen.getByRole("button", { name: "Show components" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show components" }));
  expect(screen.getByRole("complementary", { name: "Components" })).toHaveStyle(
    { width: "264px" },
  );
  fireEvent.keyDown(right, { key: "Home" });
  expect(inspector).toHaveStyle({ width: "280px" });
  fireEvent.keyDown(right, { key: "ArrowRight" });
  expect(inspector).toHaveStyle({ width: "280px" });
  fireEvent.keyDown(preview, { key: "ArrowDown", shiftKey: true });
  expect(preview).toHaveAttribute("aria-valuenow", "266");
  expect(
    screen.getByRole("region", { name: "Preview" }).parentElement,
  ).toHaveStyle({ height: "266px" });
});

test("a project the account can't see is not found", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  answer([], {
    [`GET ${PROJECT}`]: () =>
      Response.json({ detail: "project_not_found" }, { status: 404 }),
  });
  renderWithClient(
    <Boundary>
      <Editor />
    </Boundary>,
  );

  await waitFor(() => expect(navigation.notFound).toHaveBeenCalled());
  vi.mocked(console.error).mockRestore();
});
