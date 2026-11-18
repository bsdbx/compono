import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetNavigation } from "@/test-navigation";

// jsdom has no ResizeObserver; nothing in a test resizes
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Radix Select scrolls its active option into view; jsdom has no layout to scroll.
Element.prototype.scrollIntoView ??= () => {};

afterEach(() => {
  cleanup();
  resetNavigation();
});
