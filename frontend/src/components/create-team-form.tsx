import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId, useState } from "react";
import { createTeam } from "@/api/client";
import { myTeamsQueryKey } from "@/api/queries";
import type { Team } from "@/api/types";
import { Field } from "@/components/field";
import { TeamUrlInput } from "@/components/team-url-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFields, validateTeam } from "@/lib/form";
import { suggestUrl } from "@/lib/team-url";

type Values = { name: string; url: string };

/** Creates a team with its name and URL. The URL follows the name until it's edited. */
export function CreateTeamForm({
  onCreated,
  children,
}: {
  onCreated: (team: Team) => void;
  /** The buttons, which submit the form */
  children: (submitting: boolean) => ReactNode;
}) {
  // Ids of this form's own, as a page can keep another form with the same fields
  const id = useId();
  const queryClient = useQueryClient();
  const [urlEdited, setUrlEdited] = useState(false);
  const {
    values,
    errors,
    submitting: isSubmitting,
    change,
    update,
    setErrors,
    submit: send,
  } = useFields({ name: "", url: "" }, validateTeam);

  async function submit(values: Values) {
    try {
      const { data, error } = await createTeam({
        body: { ...values, name: values.name.trim() },
      });
      if (data !== undefined) {
        await queryClient.invalidateQueries({ queryKey: myTeamsQueryKey() });
        onCreated(data);
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
    setErrors({ root: "Couldn’t create the team. Try again." });
  }

  return (
    <form
      method="post"
      noValidate
      onSubmit={(event) => void send(submit, event)}
      className="flex flex-col gap-4"
    >
      <Field label="Team name" htmlFor={`${id}-team-name`} error={errors.name}>
        <Input
          id={`${id}-team-name`}
          placeholder="Acme"
          autoComplete="organization"
          aria-invalid={errors.name !== undefined}
          name="name"
          value={values.name}
          onChange={(event) => {
            const name = event.target.value;
            update({ name, ...(!urlEdited ? { url: suggestUrl(name) } : {}) });
          }}
        />
      </Field>
      <Field label="Team URL" htmlFor={`${id}-team-url`} error={errors.url}>
        <TeamUrlInput
          id={`${id}-team-url`}
          placeholder="acme"
          aria-invalid={errors.url !== undefined}
          name="url"
          value={values.url}
          onChange={(event) => {
            setUrlEdited(true);
            change("url", event.target.value);
          }}
        />
      </Field>
      {errors.root ? (
        <p role="alert" className="text-error text-sm">
          {errors.root}
        </p>
      ) : null}
      {children(isSubmitting)}
    </form>
  );
}

export function CreateTeamButton({ submitting }: { submitting: boolean }) {
  return (
    <Button type="submit" size="lg" disabled={submitting} className="mt-2">
      Create team
    </Button>
  );
}
