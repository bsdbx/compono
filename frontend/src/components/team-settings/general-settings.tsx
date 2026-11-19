import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { updateTeam } from "@/api/client";
import {
  myTeamsQueryKey,
  teamMembersOptions,
  teamProjectsOptions,
  teamQueryKey,
} from "@/api/queries";
import type { Team } from "@/api/types";
import { useSignedInAccount } from "@/components/account";
import { Field } from "@/components/field";
import {
  DangerRow,
  SettingsShell,
} from "@/components/team-settings/settings-shell";
import {
  DeleteTeamDialog,
  LeaveTeamDialog,
} from "@/components/team-settings/team-dialogs";
import { useOwnedTeam } from "@/components/team-settings/use-team";
import { TeamUrlInput } from "@/components/team-url-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFields, validateTeam } from "@/lib/form";
import { useRouter } from "@/lib/navigation";

type Values = { name: string; url: string };

/** The team's name and URL, saved as each field is left or Enter is pressed. */
function TeamForm({ team }: { team: Team }) {
  const id = useId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { values, errors, change, reset, setErrors, submit } = useFields(
    { name: team.name, url: team.url },
    validateTeam,
  );

  useEffect(() => {
    reset({ name: team.name, url: team.url });
  }, [team.name, team.url, reset]);

  async function save(values: Values) {
    const changes = {
      ...(values.name !== team.name ? { name: values.name.trim() } : {}),
      ...(values.url !== team.url ? { url: values.url } : {}),
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
        setErrors({
          url: `${window.location.host}/${values.url} is taken. Try a different URL.`,
        });
        return;
      }
    } catch {
      // The request didn't reach the API
    }
    setErrors({ root: "Couldn’t save. Try again." });
  }

  return (
    <form
      method="post"
      noValidate
      onSubmit={(event) => void submit(save, event)}
      className="flex flex-col gap-4"
    >
      <Field label="Team name" htmlFor={`${id}-name`} error={errors.name}>
        <Input
          id={`${id}-name`}
          aria-invalid={errors.name !== undefined}
          name="name"
          value={values.name}
          onChange={(event) => change("name", event.target.value)}
          onBlur={() => void submit(save)}
        />
      </Field>
      <Field label="Team URL" htmlFor={`${id}-url`} error={errors.url}>
        <TeamUrlInput
          id={`${id}-url`}
          aria-invalid={errors.url !== undefined}
          name="url"
          value={values.url}
          onChange={(event) => change("url", event.target.value)}
          onBlur={() => void submit(save)}
        />
      </Field>
      {errors.root ? (
        <p role="alert" className="text-error text-sm">
          {errors.root}
        </p>
      ) : null}
      {/* Enter saves too */}
      <button type="submit" hidden />
    </form>
  );
}

function General({ team }: { team: Team }) {
  const account = useSignedInAccount();
  const [dialog, setDialog] = useState<"leave" | "delete">();
  const { data: members = [] } = useQuery(
    teamMembersOptions({ path: { team_url: team.url } }),
  );
  const { data: projects = [] } = useQuery(
    teamProjectsOptions({ path: { team_url: team.url } }),
  );
  const onlyOwner = !members.some(
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
      description={`Manage how ${team.name} appears across Compono.`}
    >
      <TeamForm team={team} />
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
      </div>
      <LeaveTeamDialog
        team={team}
        onlyOwner={onlyOwner}
        open={dialog === "leave"}
        onOpenChange={onOpenChange}
      />
      <DeleteTeamDialog
        team={team}
        projects={projects.length}
        open={dialog === "delete"}
        onOpenChange={onOpenChange}
      />
    </SettingsShell>
  );
}

export function GeneralSettings() {
  const team = useOwnedTeam();
  return team ? <General team={team} /> : null;
}
