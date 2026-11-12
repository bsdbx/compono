import { stubApi } from "@/test-utils";

export const MIRA_MEMBER = {
  id: "0193f2c4-7c1e-7000-8000-000000000001",
  name: "Mira Kovalenko",
  email: "mira@acme.dev",
  role: "OWNER",
};
export const JONAS = {
  id: "0193f2c4-7c1e-7000-8000-000000000002",
  name: "Jonas Lind",
  email: "jonas@acme.dev",
  role: "MEMBER",
};

/** Answers a team's requests from a table of "METHOD /path" to a response maker. */
export function stubTeam(
  routes: Record<string, (request: Request) => Response>,
) {
  return stubApi((request) => {
    const route = `${request.method} ${new URL(request.url).pathname}`;
    return routes[route]?.(request);
  });
}
