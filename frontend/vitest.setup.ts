import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetNavigation } from "@/test-navigation";

afterEach(() => {
  cleanup();
  resetNavigation();
});
