import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  componentQueryKey,
  projectComponentsQueryKey,
} from "@/api/@tanstack/react-query.gen";
import type { Component, ListedComponent } from "@/api/types.gen";
import { stubApi } from "@/test-utils";
import { NameInput, nameProblem } from "./name-input";

afterEach(() => {
  vi.unstubAllGlobals();
});

const PATH = { team_url: "acme", project_url: "marketing-site" };
const URL = "/api/teams/acme/projects/marketing-site/components/c1";
const CARD = {
  id: "c1",
  name: "PricingCard",
  updated_at: "2026-11-12T10:00:00Z",
};

function renderName() {
  const queryClient = new QueryClient();
  queryClient.setQueryData<ListedComponent[]>(
    projectComponentsQueryKey({ path: PATH }),
    [CARD, { ...CARD, id: "c2", name: "NavBar" }],
  );
  queryClient.setQueryData<Component>(
    componentQueryKey({ path: { ...PATH, component_id: "c1" } }),
    { ...CARD, graph: {}, screen_sizes: [], version: 1 },
  );
  const onDone = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <NameInput
        path={PATH}
        component={CARD}
        projectName="Marketing site"
        onDone={onDone}
      />
    </QueryClientProvider>,
  );
  const field = screen.getByRole("textbox", { name: "Component name" });
  return { queryClient, onDone, field };
}

const renames = (fetch: ReturnType<typeof stubApi>) =>
  fetch.mock.calls
    .map(([request]) => request)
    .filter((r) => r.method === "PATCH");

test("a name is a capital letter, then letters and digits", () => {
  expect(nameProblem("PricingCard2")).toBeUndefined();
  for (const refused of [
    "pricingCard",
    "Pricing card",
    "Pricing-card",
    "2Card",
    "",
  ]) {
    expect(nameProblem(refused)).toBe(
      "Start with a capital letter, then use only letters and digits.",
    );
  }
  expect(nameProblem(`P${"a".repeat(63)}`)).toBeUndefined();
  expect(nameProblem(`P${"a".repeat(64)}`)).toBe("Use at most 64 characters.");
});

test("Enter renames, and the list and the component show the new name", async () => {
  const fetch = stubApi((request) =>
    request.method === "PATCH"
      ? Response.json({ ...CARD, name: "PricingTable" })
      : undefined,
  );
  const { queryClient, onDone, field } = renderName();

  // Selected, to type over
  expect(field).toHaveFocus();
  expect((field as HTMLInputElement).selectionEnd).toBe("PricingCard".length);
  fireEvent.change(field, { target: { value: " PricingTable " } });
  fireEvent.keyDown(field, { key: "Enter" });

  await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  expect(renames(fetch).map((r) => r.url)).toEqual([`http://localhost${URL}`]);
  expect(await renames(fetch)[0]?.json()).toEqual({ name: "PricingTable" });
  expect(
    queryClient
      .getQueryData<ListedComponent[]>(
        projectComponentsQueryKey({ path: PATH }),
      )
      ?.map((listed) => listed.name),
  ).toEqual(["PricingTable", "NavBar"]);
  expect(
    queryClient.getQueryData<Component>(
      componentQueryKey({ path: { ...PATH, component_id: "c1" } }),
    )?.name,
  ).toBe("PricingTable");
});

test("a taken name says so, and the field stays to change it", async () => {
  stubApi(() => Response.json({ detail: "name_taken" }, { status: 409 }));
  const { onDone, field } = renderName();

  fireEvent.change(field, { target: { value: "NavBar" } });
  fireEvent.keyDown(field, { key: "Enter" });

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "NavBar already exists in Marketing site",
  );
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(onDone).not.toHaveBeenCalled();
  // Typing again clears it
  fireEvent.change(field, { target: { value: "NavBar2" } });
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a name React can't use is refused without asking the API", () => {
  const fetch = stubApi(() => undefined);
  const { onDone, field } = renderName();

  fireEvent.change(field, { target: { value: "pricing card" } });
  fireEvent.keyDown(field, { key: "Enter" });

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Start with a capital letter, then use only letters and digits.",
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(onDone).not.toHaveBeenCalled();
});

test("Escape keeps the old name", () => {
  const fetch = stubApi(() => undefined);
  const { onDone, field } = renderName();

  fireEvent.change(field, { target: { value: "Other" } });
  fireEvent.keyDown(field, { key: "Escape" });
  fireEvent.blur(field);

  expect(onDone).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
});

test("leaving the field renames, and drops a name that can't be saved", async () => {
  const fetch = stubApi(() => Response.json({ ...CARD, name: "PricingTable" }));
  const first = renderName();
  fireEvent.change(first.field, { target: { value: "PricingTable" } });
  fireEvent.blur(first.field);
  await waitFor(() => expect(first.onDone).toHaveBeenCalledOnce());
  expect(renames(fetch)).toHaveLength(1);
});

test("leaving the field with a name that can't be saved keeps the old one", async () => {
  const fetch = stubApi(() => undefined);
  const { onDone, field } = renderName();

  fireEvent.change(field, { target: { value: "not a name" } });
  fireEvent.blur(field);

  await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  expect(fetch).not.toHaveBeenCalled();
});

test("leaving the field while Enter's rename is on its way doesn't rename again", async () => {
  let answer: (response: Response) => void = () => {};
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        answer = resolve;
      }),
  );
  stubApi(() => undefined);
  vi.stubGlobal("fetch", fetch);
  const { onDone, field } = renderName();

  fireEvent.change(field, { target: { value: "NavBar" } });
  fireEvent.keyDown(field, { key: "Enter" });
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  // The field stays usable while it waits
  expect(field).not.toBeDisabled();
  fireEvent.blur(field);
  answer(Response.json({ detail: "name_taken" }, { status: 409 }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "NavBar already exists in Marketing site",
  );
  expect(fetch).toHaveBeenCalledOnce();
  expect(onDone).not.toHaveBeenCalled();
});

test("Enter on the same name closes the field without asking the API", async () => {
  const fetch = stubApi(() => undefined);
  const { onDone, field } = renderName();

  fireEvent.change(field, { target: { value: "PricingCard " } });
  fireEvent.keyDown(field, { key: "Enter" });

  await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  expect(fetch).not.toHaveBeenCalled();
});
