import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { navigation } from "@/test-navigation";
import { Boundary, MIRA, renderWithClient, stubApi } from "@/test-utils";
import { Editor } from "./editor";

vi.mock("next/navigation", () =>
  import("@/test-navigation").then((m) => m.navigationMock),
);

beforeEach(() => {
  navigation.params = { team: "acme", project: "marketing-site" };
});

afterEach(() => {
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

test("the open component shows where it is, its nodes, and that it's saved", async () => {
  navigation.params.component = "c2";
  answer([listed("c1", "NavBar"), listed("c2", "PricingCard")], {
    [`GET ${PROJECT}/components/c2`]: () =>
      Response.json(component("c2", "PricingCard", 9)),
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
  expect(await screen.findByText("9 nodes")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Saved");
  expect(screen.getByText("Nothing to render yet")).toBeInTheDocument();
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
