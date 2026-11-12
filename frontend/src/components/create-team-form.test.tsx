import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderWithClient, stubApi } from "@/test-utils";
import { CreateTeamButton, CreateTeamForm } from "./create-team-form";

afterEach(() => {
  vi.unstubAllGlobals();
});

const ACME = {
  id: "1",
  name: "Acme Design",
  url: "acme-design",
  role: "OWNER",
};

function renderForm() {
  const onCreated = vi.fn();
  renderWithClient(
    <CreateTeamForm onCreated={onCreated}>
      {(submitting) => <CreateTeamButton submitting={submitting} />}
    </CreateTeamForm>,
  );
  return onCreated;
}

const name = () => screen.getByLabelText("Team name");
const url = () => screen.getByLabelText("Team URL");

test("the URL follows the name until it's edited", () => {
  stubApi(() => undefined);
  renderForm();

  fireEvent.change(name(), { target: { value: "Acme Design" } });
  expect(url()).toHaveValue("acme-design");

  fireEvent.change(url(), { target: { value: "acme" } });
  fireEvent.change(name(), { target: { value: "Acme Studio" } });
  expect(url()).toHaveValue("acme");
});

test("creating a team gives it to the page", async () => {
  const fetch = stubApi(() => Response.json(ACME, { status: 201 }));
  const onCreated = renderForm();

  fireEvent.change(name(), { target: { value: "Acme Design" } });
  fireEvent.click(screen.getByRole("button", { name: "Create team" }));

  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(ACME));
  const request = fetch.mock.calls[0]?.[0];
  expect(await request?.json()).toEqual({
    name: "Acme Design",
    url: "acme-design",
  });
});

test("a taken URL says so", async () => {
  stubApi(() => Response.json({ detail: "url_taken" }, { status: 409 }));
  const onCreated = renderForm();

  fireEvent.change(name(), { target: { value: "Northwind" } });
  fireEvent.click(screen.getByRole("button", { name: "Create team" }));

  expect(
    await screen.findByText(
      "localhost:3000/northwind is taken. Try a different URL.",
    ),
  ).toBeInTheDocument();
  expect(url()).toHaveAttribute("aria-invalid", "true");
  expect(onCreated).not.toHaveBeenCalled();
});

test("a URL the API would refuse is refused before any request", async () => {
  const fetch = stubApi(() => undefined);
  renderForm();

  fireEvent.change(name(), { target: { value: "Acme" } });
  fireEvent.change(url(), { target: { value: "Acme--" } });
  fireEvent.click(screen.getByRole("button", { name: "Create team" }));

  expect(
    await screen.findByText(
      "Use lowercase letters, numbers and single hyphens.",
    ),
  ).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

test("two forms on a page each label their own fields", () => {
  stubApi(() => undefined);
  renderForm();
  renderForm();

  // A label belongs to the first field with its id in the whole page, as browsers decide
  const labels = [...document.querySelectorAll("label")];
  expect(labels).toHaveLength(4);
  for (const label of labels) {
    expect(label.control?.closest("form")).toBe(label.closest("form"));
  }
});
