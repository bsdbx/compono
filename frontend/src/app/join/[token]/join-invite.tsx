"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  inviteOptions,
  joinTeamMutation,
  myTeamsQueryKey,
} from "@/api/@tanstack/react-query.gen";
import { notSignedIn, useAccount } from "@/components/account";
import { CenteredPage } from "@/components/centered-page";
import { SignedInFooter } from "@/components/signed-in-footer";
import { Button } from "@/components/ui/button";

/** What an invite link opens: the team it joins, for anyone, signed in or not. */
export function JoinInvite() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const invite = useQuery({
    ...inviteOptions({ path: { token } }),
    retry: false,
  });
  const account = useAccount();
  const join = useMutation({
    ...joinTeamMutation(),
    onSuccess: async (team) => {
      await queryClient.invalidateQueries({ queryKey: myTeamsQueryKey() });
      router.replace(`/${team.url}`);
    },
  });

  if (invite.isPending || account.isPending) {
    return null;
  }
  if (invite.isError || join.isError) {
    return (
      <CenteredPage
        title="This invite link isn’t valid"
        description="It may have expired. Ask the team for a new one."
        footer={<SignedInFooter />}
      >
        <Button size="lg" variant="secondary" asChild>
          <Link href="/">Back to projects</Link>
        </Button>
      </CenteredPage>
    );
  }

  const team = invite.data.team_name;
  const here = encodeURIComponent(`/join/${token}`);
  if (account.isError && notSignedIn(account.error) !== undefined) {
    return (
      <CenteredPage
        title={`Join ${team}`}
        description={`You were invited to ${team} on Compono.`}
      >
        <Button size="lg" asChild>
          <Link href={`/sign-up?next=${here}`}>Create an account</Link>
        </Button>
        <Button size="lg" variant="secondary" asChild>
          <Link href={`/sign-in?next=${here}`}>I already have an account</Link>
        </Button>
      </CenteredPage>
    );
  }
  return (
    <CenteredPage
      title={`Join ${team}`}
      description={`You were invited to ${team} on Compono.`}
      footer={<SignedInFooter />}
    >
      <Button
        size="lg"
        disabled={join.isPending}
        onClick={() => join.mutate({ path: { token } })}
      >
        Join {team}
      </Button>
    </CenteredPage>
  );
}
