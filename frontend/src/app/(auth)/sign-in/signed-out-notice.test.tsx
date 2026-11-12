import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { navigation } from "@/test-navigation";
import { SignedOutNotice } from "./signed-out-notice";

vi.mock("next/navigation", () =>
  import("@/test-navigation").then((m) => m.navigationMock),
);

test.each([
  ["reason=signed_out", "You were signed out from another device."],
  ["reason=expired", "Your session expired. Sign in again."],
])("with %s, sign in says why", (query, message) => {
  navigation.search = new URLSearchParams(query);
  render(<SignedOutNotice />);

  expect(screen.getByRole("status")).toHaveTextContent(message);
});

test("without a reason, sign in says nothing more", () => {
  navigation.search = new URLSearchParams("reason=nonsense");
  render(<SignedOutNotice />);

  expect(screen.queryByRole("status")).toBeNull();
});
