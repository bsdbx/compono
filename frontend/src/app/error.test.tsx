import { fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { MIRA, renderWithClient, stubApi } from "@/test-utils";
import ErrorPage from "./error";

vi.mock("next/navigation", () =>
  import("@/test-navigation").then((m) => m.navigationMock),
);

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the error page tries again, or goes back to the projects", () => {
  stubApi(() => Response.json({ detail: "no_session" }, { status: 401 }));
  const retry = vi.fn();
  renderWithClient(<ErrorPage retry={retry} />);

  expect(
    screen.getByRole("heading", { name: "Something went wrong" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
  expect(
    screen.getByRole("link", { name: "Back to projects" }),
  ).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "Compono home" })).toHaveAttribute(
    "href",
    "/",
  );
});

test("the error page says who is signed in", async () => {
  stubApi(() => Response.json(MIRA));
  renderWithClient(<ErrorPage retry={vi.fn()} />);

  expect(
    await screen.findByText(/Signed in as mira@acme.dev/),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
});
