"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Team } from "@/api/types.gen";
import { CenteredPage } from "@/components/centered-page";
import {
  CreateTeamButton,
  CreateTeamForm,
} from "@/components/create-team-form";
import { JoinTeamForm } from "@/components/join-team-form";
import { SignedInFooter } from "@/components/signed-in-footer";
import { Button } from "@/components/ui/button";

/** Creates the account's first team, or joins one with an invite link. */
export function FirstRun() {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const open = (team: Team) => router.replace(`/${team.url}`);

  return (
    <CenteredPage
      title="Set up your team"
      description="Teams hold your projects, components and members."
      footer={<SignedInFooter />}
    >
      <CreateTeamForm onCreated={open}>
        {(submitting) => <CreateTeamButton submitting={submitting} />}
      </CreateTeamForm>
      <div className="my-5 flex items-center gap-3 text-sm text-subtle-foreground">
        <span className="h-px flex-1 bg-border" />
        or join an existing team
        <span className="h-px flex-1 bg-border" />
      </div>
      {joining ? (
        <JoinTeamForm onJoined={open}>
          {(submitting) => (
            <Button
              type="submit"
              variant="secondary"
              size="lg"
              disabled={submitting}
            >
              Join
            </Button>
          )}
        </JoinTeamForm>
      ) : (
        <p className="text-center text-base text-muted-foreground">
          Have an invite link?{" "}
          <button
            type="button"
            onClick={() => setJoining(true)}
            className="font-medium text-foreground"
          >
            Paste it here
          </button>
        </p>
      )}
    </CenteredPage>
  );
}
