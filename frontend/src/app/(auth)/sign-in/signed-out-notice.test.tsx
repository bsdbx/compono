import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SignedOutNotice } from "./signed-out-notice";

const search = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => search.params }));

test.each([
  ["reason=signed_out", "You were signed out from another device."],
  ["reason=expired", "Your session expired. Sign in again."],
])("with %s, sign in says why", (query, message) => {
  search.params = new URLSearchParams(query);
  render(<SignedOutNotice />);

  expect(screen.getByRole("status")).toHaveTextContent(message);
});

test("without a reason, sign in says nothing more", () => {
  search.params = new URLSearchParams("reason=nonsense");
  render(<SignedOutNotice />);

  expect(screen.queryByRole("status")).toBeNull();
});
