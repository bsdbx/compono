"use client";

import { useQuery } from "@tanstack/react-query";
import { LayoutGrid } from "lucide-react";
import Link from "next/link";
import { teamProjectsOptions } from "@/api/@tanstack/react-query.gen";
import type { Team } from "@/api/types.gen";
import { AccountMenu } from "@/components/account-menu";
import { TeamMenu } from "@/components/team-menu";

/** A team's sidebar: the team menu, the projects, and the account at the bottom. */
export function TeamSidebar({ team }: { team: Team }) {
  const { data: projects } = useQuery(
    teamProjectsOptions({ path: { team_url: team.url } }),
  );
  return (
    <aside className="flex w-59 shrink-0 flex-col border-sidebar-border border-r bg-sidebar">
      <div className="p-2">
        <TeamMenu team={team} />
      </div>
      <nav aria-label={team.name} className="flex-1 px-2 py-1">
        <Link
          href={`/${team.url}`}
          aria-current="page"
          className="flex h-8 items-center gap-2.5 rounded-md bg-sidebar-accent px-2 font-medium text-sm"
        >
          <LayoutGrid className="size-3.5 text-muted-foreground" />
          <span className="flex-1">All projects</span>
          {projects ? (
            <span className="rounded-sm bg-muted px-1.5 font-semibold text-2xs text-muted-foreground">
              {projects.length}
            </span>
          ) : null}
        </Link>
      </nav>
      <div className="border-sidebar-border border-t p-2">
        <AccountMenu />
      </div>
    </aside>
  );
}
