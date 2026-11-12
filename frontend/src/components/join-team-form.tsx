"use client";

import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { myTeamsQueryKey } from "@/api/@tanstack/react-query.gen";
import { joinTeam } from "@/api/sdk.gen";
import type { Team } from "@/api/types.gen";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { inviteToken } from "@/lib/team-url";

export const LINK_NOT_VALID =
  "This invite link isn’t valid. It may have expired, so ask the team for a new one.";

/** Joins a team with an invite link that someone shared. */
export function JoinTeamForm({
  onJoined,
  children,
}: {
  onJoined: (team: Team) => void;
  /** The join button, which submits the form */
  children: (submitting: boolean) => ReactNode;
}) {
  const queryClient = useQueryClient();
  const [link, setLink] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const token = inviteToken(link);
    if (token === "") {
      setError("Paste the invite link.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: failed } = await joinTeam({ path: { token } });
      if (data !== undefined) {
        await queryClient.invalidateQueries({ queryKey: myTeamsQueryKey() });
        onJoined(data);
        return;
      }
      setError(
        failed?.detail === "invite_link_not_valid"
          ? LINK_NOT_VALID
          : "Couldn’t join the team. Try again.",
      );
    } catch {
      setError("Couldn’t join the team. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form method="post" noValidate onSubmit={(event) => void submit(event)}>
      <Field label="Invite link" htmlFor="invite-link" error={error}>
        <div className="flex gap-2">
          <Input
            id="invite-link"
            placeholder={`${window.location.host}/join/…`}
            autoCapitalize="none"
            spellCheck={false}
            value={link}
            onChange={(event) => {
              setLink(event.target.value);
              setError(undefined);
            }}
            aria-invalid={error !== undefined}
          />
          {children(submitting)}
        </div>
      </Field>
    </form>
  );
}
