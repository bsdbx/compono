"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Link2, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { myTeamsOptions } from "@/api/@tanstack/react-query.gen";
import type { Team } from "@/api/types.gen";
import { CreateTeamDialog, JoinTeamDialog } from "@/components/team-dialogs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The team at the top of the sidebar, with a menu to switch teams, open their settings, or create and join one. */
export function TeamMenu({ team }: { team: Team }) {
  const { data: teams = [] } = useQuery(myTeamsOptions());
  const [dialog, setDialog] = useState<"create" | "join">();
  const onOpenChange = (open: boolean) => {
    if (!open) {
      setDialog(undefined);
    }
  };

  return (
    <>
      {/* Not modal, so that a dialog can open as the menu closes */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-9 w-full items-center justify-between rounded-lg px-2.5 font-semibold text-base hover:bg-accent data-[state=open]:bg-accent"
          >
            <span className="truncate">{team.name}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="text-base">
          <DropdownMenuLabel className="text-sm text-subtle-foreground">
            Teams
          </DropdownMenuLabel>
          {teams.map((other) => (
            <DropdownMenuItem key={other.id} asChild className="h-9 text-base">
              <Link href={`/${other.url}`}>
                <span className="flex-1 truncate">{other.name}</span>
                {other.id === team.id ? (
                  <Check className="size-4" aria-label="Current team" />
                ) : null}
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="h-9 text-base">
            <Link href={`/${team.url}/settings`}>
              <Settings className="size-4" />
              Team settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="h-9 text-base"
            onSelect={() => setDialog("create")}
          >
            <Plus className="size-4" />
            Create team
          </DropdownMenuItem>
          <DropdownMenuItem
            className="h-9 text-base"
            onSelect={() => setDialog("join")}
          >
            <Link2 className="size-4" />
            Join team
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateTeamDialog
        open={dialog === "create"}
        onOpenChange={onOpenChange}
      />
      <JoinTeamDialog open={dialog === "join"} onOpenChange={onOpenChange} />
    </>
  );
}
