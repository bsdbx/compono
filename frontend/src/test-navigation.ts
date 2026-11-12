import { vi } from "vitest";

/** What tests see of Next's navigation, and change: the router's calls, the search params and the route's params. */
export const navigation = {
  router: { replace: vi.fn(), push: vi.fn() },
  search: new URLSearchParams(),
  params: {} as Record<string, string>,
  notFound: vi.fn(() => {
    throw new Error("Not found");
  }),
};

/** In a test: vi.mock("next/navigation", () => import("@/test-navigation").then((m) => m.navigationMock)) */
export const navigationMock = {
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
