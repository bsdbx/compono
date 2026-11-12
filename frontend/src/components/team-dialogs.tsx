"use client";

import { useRouter } from "next/navigation";
import type { Team } from "@/api/types.gen";
import { CreateTeamForm } from "@/components/create-team-form";
import { JoinTeamForm } from "@/components/join-team-form";
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

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** Opens a team that was just created or joined, closing the dialog. */
function useOpenTeam(onOpenChange: (open: boolean) => void) {
  const router = useRouter();
  return (team: Team) => {
    onOpenChange(false);
    router.push(`/${team.url}`);
  };
}

export function CreateTeamDialog({ open, onOpenChange }: DialogProps) {
  const openTeam = useOpenTeam(onOpenChange);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create team</DialogTitle>
          <DialogDescription>
            You’ll be its owner. Invite people from team settings.
          </DialogDescription>
        </DialogHeader>
        <CreateTeamForm onCreated={openTeam}>
          {(submitting) => (
            <DialogFooter className="pt-1">
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                Create team
              </Button>
            </DialogFooter>
          )}
        </CreateTeamForm>
      </DialogContent>
    </Dialog>
  );
}

export function JoinTeamDialog({ open, onOpenChange }: DialogProps) {
  const openTeam = useOpenTeam(onOpenChange);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join team</DialogTitle>
          <DialogDescription>
            Paste the invite link someone on the team shared with you.
          </DialogDescription>
        </DialogHeader>
        <JoinTeamForm onJoined={openTeam}>
          {(submitting) => (
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                Join
              </Button>
            </DialogFooter>
          )}
        </JoinTeamForm>
      </DialogContent>
    </Dialog>
  );
}
