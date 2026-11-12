"use client";

import { useQuery } from "@tanstack/react-query";
import { Copy, MoreHorizontal, Search, UserCog, UserMinus } from "lucide-react";
import { useId, useState } from "react";
import {
  inviteLinkOptions,
  teamMembersOptions,
} from "@/api/@tanstack/react-query.gen";
import type { Member, Team } from "@/api/types.gen";
import { useSignedInAccount } from "@/components/account";
import { Avatar } from "@/components/avatar";
import { SettingsShell } from "@/components/team-settings/settings-shell";
import {
  MakeOwnerDialog,
  RemoveMemberDialog,
} from "@/components/team-settings/team-dialogs";
import { useTeam } from "@/components/team-settings/use-team";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

const TIME = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

/** The team's invite link, to copy. It works for an hour, and a new one appears here after. */
function InviteLink({ team }: { team: Team }) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const { data: link } = useQuery(
    inviteLinkOptions({ path: { team_url: team.url } }),
  );
  const url = link ? `${window.location.origin}/join/${link.token}` : "";

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`${id}-link`} className="font-medium text-sm">
        Invite link
      </label>
      <div className="flex gap-2">
        <Input id={`${id}-link`} readOnly value={url} />
        <Button
          variant="secondary"
          size="default"
          className="h-9"
          disabled={!link}
          onClick={() => void copy()}
        >
          <Copy className="size-3.5" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-base text-muted-foreground">
        Anyone with this link joins {team.name} as a member
        {link ? `, until ${TIME.format(new Date(link.expires_at))}` : ""}.
      </p>
    </div>
  );
}

type Action = { kind: "owner" | "remove"; member: Member };

function MemberRow({
  member,
  you,
  manage,
  onAction,
}: {
  member: Member;
  you: boolean;
  /** Whether the signed-in owner can change this member */
  manage: boolean;
  onAction: (action: Action) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar id={member.id} name={member.name} className="size-8 text-xs" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-base">
          {member.name}
          {you ? (
            <span className="font-normal text-muted-foreground"> (you)</span>
          ) : null}
        </p>
        <p className="truncate text-muted-foreground text-sm">{member.email}</p>
      </div>
      <span className="text-muted-foreground text-base">
        {member.role === "OWNER" ? "Owner" : "Member"}
      </span>
      <div className="w-8">
        {manage ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Change ${member.name}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                className="h-9 text-base"
                onSelect={() => onAction({ kind: "owner", member })}
              >
                <UserCog className="size-4" />
                Make owner
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                className="h-9 text-base text-error"
                onSelect={() => onAction({ kind: "remove", member })}
              >
                <UserMinus className="size-4" />
                Remove from team
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </li>
  );
}

function Members({ team }: { team: Team }) {
  const account = useSignedInAccount();
  const owner = team.role === "OWNER";
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<Action>();
  const { data: members = [] } = useQuery(
    teamMembersOptions({ path: { team_url: team.url } }),
  );
  const query = search.trim().toLowerCase();
  const shown = members.filter(
    (member) =>
      member.name.toLowerCase().includes(query) ||
      member.email.toLowerCase().includes(query),
  );
  const onOpenChange = (open: boolean) => {
    if (!open) {
      setAction(undefined);
    }
  };

  return (
    <SettingsShell
      team={team}
      section="Members"
      description={
        owner
          ? `Everyone in ${team.name}. Project access is set in each project.`
          : `Everyone in ${team.name}. Only owners can invite or remove people.`
      }
    >
      {owner ? (
        <>
          <InviteLink team={team} />
          <hr className="my-8" />
        </>
      ) : null}
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="font-medium text-base">
          {members.length} {members.length === 1 ? "member" : "members"}
        </h2>
        <div className="relative w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle-foreground" />
          <Input
            type="search"
            aria-label="Search members"
            placeholder="Search members"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-7.5 pl-8 text-sm"
          />
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="py-8 text-center text-base text-muted-foreground">
          No members match “{search.trim()}”.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {shown.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              you={member.id === account.id}
              manage={owner && member.role !== "OWNER"}
              onAction={setAction}
            />
          ))}
        </ul>
      )}
      {action?.kind === "owner" ? (
        <MakeOwnerDialog
          team={team}
          member={action.member}
          open
          onOpenChange={onOpenChange}
        />
      ) : null}
      {action?.kind === "remove" ? (
        <RemoveMemberDialog
          team={team}
          member={action.member}
          open
          onOpenChange={onOpenChange}
        />
      ) : null}
    </SettingsShell>
  );
}

export function MembersSettings() {
  const team = useTeam();
  return team ? <Members team={team} /> : null;
}
