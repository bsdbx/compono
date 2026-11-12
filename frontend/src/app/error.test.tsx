import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import ErrorPage from "./error";

test("the error page tries again, or goes back to the projects", () => {
  const retry = vi.fn();
  render(<ErrorPage retry={retry} />);

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
