import { type ComponentProps, createElement } from "react";
import { vi } from "vitest";

/** What component tests see and change: navigation calls, search params and route params. */
export const navigation = {
  router: { replace: vi.fn(), push: vi.fn() },
  search: new URLSearchParams(),
  params: {} as Record<string, string>,
  notFound: vi.fn(() => {
    throw new Error("Not found");
  }),
};

/** In a test: vi.mock("@/lib/navigation", () => import("@/test-navigation").then((m) => m.navigationMock)) */
export const navigationMock = {
  Link: ({ href, ...props }: ComponentProps<"a">) =>
    createElement("a", { href, ...props }),
  useRouter: () => navigation.router,
  useSearchParams: () => navigation.search,
  useParams: () => navigation.params,
  notFound: () => navigation.notFound(),
};

/** Forgets what the last test did. */
export function resetNavigation() {
  navigation.router.replace.mockClear();
  navigation.router.push.mockClear();
  navigation.search = new URLSearchParams();
  navigation.params = {};
  navigation.notFound.mockClear();
}
