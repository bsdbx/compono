import { type ComponentProps, useMemo } from "react";
import {
  Link as RouterLink,
  useNavigate,
  useParams as useRouteParams,
  useSearchParams as useRouterSearchParams,
} from "react-router";

/** Required params are guaranteed by the route that renders each page. */
export function useParams<T extends Record<string, string | undefined>>() {
  return useRouteParams() as T;
}

/** App links keep normal browser behavior, including opening in another tab. */
export function Link({
  href,
  ...props
}: Omit<ComponentProps<typeof RouterLink>, "to"> & { href: string }) {
  return <RouterLink to={href} {...props} />;
}

export function useRouter() {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (url: string) => {
        void navigate(url);
      },
      replace: (url: string) => {
        void navigate(url, { replace: true });
      },
    }),
    [navigate],
  );
}

export function useSearchParams() {
  return useRouterSearchParams()[0];
}

/** Distinguishes an inaccessible route from an unexpected application error. */
export class NotFoundError extends Error {}

export function notFound(): never {
  throw new NotFoundError("Not found");
}
