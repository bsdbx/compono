import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { currentAccountQueryKey } from "@/api/@tanstack/react-query.gen";
import { MIRA, renderWithClient, stubApi } from "@/test-utils";
import { SignInForm } from "./sign-in-form";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  router.replace.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

test("signing in goes to the projects, with the account known", async () => {
  const fetch = stubApi(() => Response.json(MIRA, { status: 201 }));
  const queryClient = renderWithClient(<SignInForm />);

  fill("mira@acme.dev", "correct horse battery staple");

  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
  expect(queryClient.getQueryData(currentAccountQueryKey())).toEqual(MIRA);
  const request = fetch.mock.calls[0]?.[0];
  expect(request?.url).toBe("http://localhost/api/sessions");
  expect(await request?.json()).toEqual({
    email: "mira@acme.dev",
    password: "correct horse battery staple",
  });
});

test("a wrong email or password marks both fields, with one message", async () => {
  stubApi(() =>
    Response.json({ detail: "wrong_email_or_password" }, { status: 401 }),
  );
  renderWithClient(<SignInForm />);

  fill("mira@acme.dev", "wrong password");

  expect(
    await screen.findByText("Email or password is incorrect."),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Email")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByLabelText("Password")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(router.replace).not.toHaveBeenCalled();
});

test("empty fields are refused before any request", async () => {
  const fetch = stubApi(() => undefined);
  renderWithClient(<SignInForm />);

  fill("", "");

  expect(await screen.findByText("Enter your email.")).toBeInTheDocument();
  expect(screen.getByText("Enter your password.")).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

test("an API that can't be reached says so", async () => {
  stubApi(() => {
    throw new TypeError("Failed to fetch");
  });
  renderWithClient(<SignInForm />);

  fill("mira@acme.dev", "correct horse battery staple");

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn’t sign in. Try again in a moment.",
  );
});

test("the password can be shown", () => {
  stubApi(() => undefined);
  renderWithClient(<SignInForm />);

  fireEvent.click(screen.getByRole("button", { name: "Show password" }));

  expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
  expect(
    screen.getByRole("button", { name: "Hide password" }),
  ).toBeInTheDocument();
});
