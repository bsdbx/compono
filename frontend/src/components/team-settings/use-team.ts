import { useQuery } from "@tanstack/react-query";
import { teamOptions } from "@/api/queries";
import type { Team } from "@/api/types";
import { notFound, useParams } from "@/lib/navigation";

/** The team of the page's URL, or the not-found page when the account isn't in it. */
export function useTeam(): Team | undefined {
  const { team: url } = useParams<{ team: string }>();
  const { data, error } = useQuery({
    ...teamOptions({ path: { team_url: url } }),
    retry: false,
  });
  if (error !== null) {
    // The API doesn't tell a missing team from one the account isn't in
    notFound();
  }
  return data;
}

/** Settings are accessible only to the team's owners, including by direct URL. */
export function useOwnedTeam(): Team | undefined {
  const team = useTeam();
  if (team && team.role !== "OWNER") notFound();
  return team;
}

/** The first word of a name, as dialogs address people: Jonas for Jonas Lind. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
