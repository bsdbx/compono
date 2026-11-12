"use client";

import { useQuery } from "@tanstack/react-query";
import { notFound, useParams } from "next/navigation";
import { teamOptions } from "@/api/@tanstack/react-query.gen";
import type { Team } from "@/api/types.gen";

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

/** The first word of a name, as dialogs address people: Jonas for Jonas Lind. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
