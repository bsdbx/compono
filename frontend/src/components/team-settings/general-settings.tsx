"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import {
  myTeamsQueryKey,
  teamMembersOptions,
  teamProjectsOptions,
  teamQueryKey,
} from "@/api/@tanstack/react-query.gen";
import { updateTeam } from "@/api/sdk.gen";
import type { Team } from "@/api/types.gen";
import { useSignedInAccount } from "@/components/account";
import { Avatar } from "@/components/avatar";
import { teamSchema } from "@/components/create-team-form";
import { Field } from "@/components/field";
import {
  DangerRow,
  SettingsShell,
} from "@/components/team-settings/settings-shell";
import {
  DeleteTeamDialog,
  LeaveTeamDialog,
} from "@/components/team-settings/team-dialogs";
import { useTeam } from "@/components/team-settings/use-team";
import { TeamUrlInput } from "@/components/team-url-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Values = { name: string; url: string };

/** The team's name and URL, saved as each field is left or Enter is pressed. */
function TeamForm({ team }: { team: Team }) {
  const id = useId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<Values>({
    resolver: zodResolver(teamSchema),
    values: { name: team.name, url: team.url },
  });

  async function save(values: Values) {
    const changes = {
      ...(dirtyFields.name ? { name: values.name } : {}),
      ...(dirtyFields.url ? { url: values.url } : {}),
    };
    if (Object.keys(changes).length === 0) {
      return;
    }
    try {
      const { data, error } = await updateTeam({
        path: { team_url: team.url },
        body: changes,
      });
      if (data !== undefined) {
        queryClient.setQueryData(
          teamQueryKey({ path: { team_url: data.url } }),
          data,
        );
        await queryClient.invalidateQueries({ queryKey: myTeamsQueryKey() });
        reset({ name: data.name, url: data.url });
        if (data.url !== team.url) {
          router.replace(`/${data.url}/settings`);
        }
        return;
      }
      if (error?.detail === "url_taken") {
        setError("url", {
          message: `${window.location.host}/${values.url} is taken. Try a different URL.`,
        });
        return;
      }
    } catch {
      // The request didn't reach the API
    }
    setError("root", { message: "Couldn’t save. Try again." });
  }

  const submit = handleSubmit(save);
  return (
    <form
      method="post"
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-4"
    >
      <Field
        label="Team name"
        htmlFor={`${id}-name`}
        error={errors.name?.message}
      >
        <Input
          id={`${id}-name`}
          aria-invalid={errors.name !== undefined}
          {...register("name", { onBlur: () => void submit() })}
        />
      </Field>
      <Field label="Team URL" htmlFor={`${id}-url`} error={errors.url?.message}>
        <TeamUrlInput
          id={`${id}-url`}
          aria-invalid={errors.url !== undefined}
          {...register("url", { onBlur: () => void submit() })}
        />
      </Field>
      {errors.root ? (
        <p role="alert" className="text-error text-sm">
          {errors.root.message}
        </p>
      ) : null}
      {/* Enter saves too */}
      <button type="submit" hidden />
    </form>
  );
}

/** What a member sees instead of the form: the name and URL, and who the owners are. */
function TeamFacts({ team }: { team: Team }) {
  const { data: members = [] } = useQuery(
    teamMembersOptions({ path: { team_url: team.url } }),
  );
  const owners = members.filter((member) => member.role === "OWNER");
  return (
    <dl className="flex flex-col gap-5 text-base">
      <div>
        <dt className="font-medium text-sm">Team name</dt>
        <dd className="mt-1.5 text-muted-foreground">{team.name}</dd>
      </div>
      <div>
        <dt className="font-medium text-sm">Team URL</dt>
        <dd className="mt-1.5 text-muted-foreground">
          {window.location.host}/{team.url}
        </dd>
      </div>
      <div>
        <dt className="font-medium text-sm">
          {owners.length === 1 ? "Owner" : "Owners"}
        </dt>
        {owners.map((owner) => (
          <dd key={owner.id} className="mt-2 flex items-center gap-2.5">
            <Avatar id={owner.id} name={owner.name} className="size-6" />
            {owner.name}
          </dd>
        ))}
      </div>
    </dl>
  );
}

function General({ team }: { team: Team }) {
  const account = useSignedInAccount();
  const owner = team.role === "OWNER";
  const [dialog, setDialog] = useState<"leave" | "delete">();
  const { data: members = [] } = useQuery(
    teamMembersOptions({ path: { team_url: team.url } }),
  );
  const { data: projects = [] } = useQuery({
    ...teamProjectsOptions({ path: { team_url: team.url } }),
    enabled: owner,
  });
  const onlyOwner =
    owner &&
    !members.some(
      (member) => member.role === "OWNER" && member.id !== account.id,
    );
  const onOpenChange = (open: boolean) => {
    if (!open) {
      setDialog(undefined);
    }
  };

  return (
    <SettingsShell
      team={team}
      section="General"
      description={
        owner
          ? `Manage how ${team.name} appears across Compono.`
          : "Only owners can change these."
      }
    >
      {owner ? <TeamForm team={team} /> : <TeamFacts team={team} />}
      <hr className="my-8" />
      <h2 className="mb-5 font-medium text-base">Danger zone</h2>
      <div className="flex flex-col gap-6">
        <DangerRow
          title="Leave team"
          description={`Remove yourself from ${team.name}.`}
        >
          <Button
            variant="secondary"
            className="text-error"
            onClick={() => setDialog("leave")}
          >
            Leave team
          </Button>
        </DangerRow>
        {owner ? (
          <DangerRow
            title="Delete team"
            description={`Removes ${team.name}, its projects and components for every member.`}
          >
            <Button
              variant="secondary"
              className="text-error"
              onClick={() => setDialog("delete")}
            >
              Delete team
            </Button>
          </DangerRow>
        ) : null}
      </div>
      <LeaveTeamDialog
        team={team}
        onlyOwner={onlyOwner}
        open={dialog === "leave"}
        onOpenChange={onOpenChange}
      />
      {owner ? (
        <DeleteTeamDialog
          team={team}
          projects={projects.length}
          open={dialog === "delete"}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </SettingsShell>
  );
}

export function GeneralSettings() {
  const team = useTeam();
  return team ? <General team={team} /> : null;
}
