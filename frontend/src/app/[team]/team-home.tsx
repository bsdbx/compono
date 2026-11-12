"use client";

import { useQuery } from "@tanstack/react-query";
import { notFound, useParams } from "next/navigation";
import { teamOptions } from "@/api/@tanstack/react-query.gen";
import { SignedIn } from "@/components/account";
import { TeamSidebar } from "@/components/team-sidebar";

function TeamHomeContent() {
  const { team: url } = useParams<{ team: string }>();
  const { data: team, error } = useQuery({
    ...teamOptions({ path: { team_url: url } }),
    retry: false,
  });

  if (error !== null) {
    // Also a team the account isn't in, which the API won't tell apart
    notFound();
  }
  return (
    <div className="flex flex-1">
      {team ? <TeamSidebar team={team} /> : null}
      <main className="flex flex-1 flex-col items-center justify-center gap-2">
        <h1 className="font-semibold text-2xl">{team?.name}</h1>
      </main>
    </div>
  );
}

// The projects come with their own page; until then a team shows its name
export function TeamHome() {
  return (
    <SignedIn>
      <TeamHomeContent />
    </SignedIn>
  );
}
