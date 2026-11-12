"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState } from "react";
import {
  deleteTeamMutation,
  leaveTeamMutation,
  makeOwnerMutation,
  removeMemberMutation,
  teamMembersQueryKey,
} from "@/api/@tanstack/react-query.gen";
import type { Member, Team } from "@/api/types.gen";
import { firstName } from "@/components/team-settings/use-team";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** A confirmation: a question, what it means, Cancel and the action. */
function Confirm({
  open,
  onOpenChange,
  title,
  description,
  children,
  failed,
}: DialogProps & {
  title: string;
  description: string;
  children: ReactNode;
  failed?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {failed ? (
          <p role="alert" className="text-error text-sm">
            That didn’t work. Try again.
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          {children}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Forgets what was loaded for the team, as its members or the account's teams changed. */
function useForgetTeams() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries();
}

export function MakeOwnerDialog({
  team,
  member,
  ...dialog
}: DialogProps & { team: Team; member: Member }) {
  const queryClient = useQueryClient();
  const makeOwner = useMutation({
    ...makeOwnerMutation(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: teamMembersQueryKey({ path: { team_url: team.url } }),
      });
      dialog.onOpenChange(false);
    },
  });
  const name = firstName(member.name);
  return (
    <Confirm
      {...dialog}
      title={`Make ${name} an owner?`}
      description={`${name} gets the same access to ${team.name} as you.`}
      failed={makeOwner.isError}
    >
      <Button
        disabled={makeOwner.isPending}
        onClick={() =>
          makeOwner.mutate({
            path: { team_url: team.url, account_id: member.id },
          })
        }
      >
        Make owner
      </Button>
    </Confirm>
  );
}

export function RemoveMemberDialog({
  team,
  member,
  ...dialog
}: DialogProps & { team: Team; member: Member }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    ...removeMemberMutation(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: teamMembersQueryKey({ path: { team_url: team.url } }),
      });
      dialog.onOpenChange(false);
    },
  });
  const name = firstName(member.name);
  return (
    <Confirm
      {...dialog}
      title={`Remove ${name} from ${team.name}?`}
      description={`${name} loses access to every ${team.name} project. Components they built stay where they are.`}
      failed={remove.isError}
    >
      <Button
        variant="destructive"
        disabled={remove.isPending}
        onClick={() =>
          remove.mutate({ path: { team_url: team.url, account_id: member.id } })
        }
      >
        Remove from team
      </Button>
    </Confirm>
  );
}

/** Leaves the team, or, for its only owner, says to hand it over first. */
export function LeaveTeamDialog({
  team,
  onlyOwner,
  ...dialog
}: DialogProps & { team: Team; onlyOwner: boolean }) {
  const router = useRouter();
  const forget = useForgetTeams();
  const [lastOwner, setLastOwner] = useState(false);
  const leave = useMutation({
    ...leaveTeamMutation(),
    onSuccess: async () => {
      await forget();
      router.replace("/");
    },
    onError: (error) => {
      // Another owner may have left since the page loaded
      setLastOwner(error.detail === "last_owner");
    },
  });

  if (onlyOwner || lastOwner) {
    return (
      <Confirm
        {...dialog}
        title={`Hand over ${team.name} first`}
        description={`You’re the only owner of ${team.name}. Make another member an owner, then you can leave.`}
      >
        <Button asChild>
          <Link href={`/${team.url}/settings/members`}>Go to members</Link>
        </Button>
      </Confirm>
    );
  }
  return (
    <Confirm
      {...dialog}
      title={`Leave ${team.name}?`}
      description="You’ll lose access to its projects. You can rejoin with a new invite link."
      failed={leave.isError}
    >
      <Button
        variant="destructive"
        disabled={leave.isPending}
        onClick={() => leave.mutate({ path: { team_url: team.url } })}
      >
        Leave team
      </Button>
    </Confirm>
  );
}

function projectsPhrase(projects: number): string {
  if (projects === 0) {
    return "This permanently deletes the team";
  }
  return `This permanently deletes the team and its ${projects} ${projects === 1 ? "project" : "projects"}`;
}

/** Deletes the team once its URL is typed, as there is no undoing it. */
export function DeleteTeamDialog({
  team,
  projects,
  ...dialog
}: DialogProps & { team: Team; projects: number }) {
  const id = useId();
  const router = useRouter();
  const forget = useForgetTeams();
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    ...deleteTeamMutation(),
    onSuccess: async () => {
      await forget();
      router.replace("/");
    },
  });
  return (
    <Dialog
      open={dialog.open}
      onOpenChange={(open) => {
        setTyped("");
        dialog.onOpenChange(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {team.name}?</DialogTitle>
          <DialogDescription>
            {projectsPhrase(projects)}, and removes access for every member.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-confirm`} className="text-sm">
            Type <span className="font-mono text-foreground">{team.url}</span>{" "}
            to confirm
          </label>
          <Input
            id={`${id}-confirm`}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
        {remove.isError ? (
          <p role="alert" className="text-error text-sm">
            That didn’t work. Try again.
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={typed !== team.url || remove.isPending}
            onClick={() => remove.mutate({ path: { team_url: team.url } })}
          >
            Delete team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
