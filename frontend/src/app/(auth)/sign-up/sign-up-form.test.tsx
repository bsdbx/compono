import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { navigation } from "@/test-navigation";
import { MIRA, renderWithClient, stubApi } from "@/test-utils";
import { SignUpForm } from "./sign-up-form";

vi.mock("next/navigation", () =>
  import("@/test-navigation").then((m) => m.navigationMock),
);

afterEach(() => {
  vi.unstubAllGlobals();
});

function fill(name: string, email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Work email"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

test("creating an account goes to the projects", async () => {
  const fetch = stubApi(() => Response.json(MIRA, { status: 201 }));
  renderWithClient(<SignUpForm />);

  fill("Mira Kovalenko", "mira@acme.dev", "correct horse battery staple");

  await waitFor(() =>
    expect(navigation.router.replace).toHaveBeenCalledWith("/"),
  );
  const request = fetch.mock.calls[0]?.[0];
  expect(request?.url).toBe("http://localhost/api/accounts");
  expect(await request?.json()).toEqual({
    name: "Mira Kovalenko",
    email: "mira@acme.dev",
    password: "correct horse battery staple",
  });
});

test("a taken email says so, with a link to sign in", async () => {
  stubApi(() => Response.json({ detail: "email_taken" }, { status: 409 }));
  renderWithClient(<SignUpForm />);

  fill("Mira Kovalenko", "mira@acme.dev", "correct horse battery staple");

  expect(
    await screen.findByText(/An account with this email already exists/),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/sign-in",
  );
  expect(screen.getByLabelText("Work email")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

test("the API's limits are checked before any request", async () => {
  const fetch = stubApi(() => undefined);
  renderWithClient(<SignUpForm />);

  fill("   ", "mira@", "short");

  expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
  expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
  expect(screen.getByText("Use at least 8 characters.")).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
