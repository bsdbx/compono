"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { myTeamsQueryKey } from "@/api/@tanstack/react-query.gen";
import { createTeam } from "@/api/sdk.gen";
import type { Team } from "@/api/types.gen";
import { Field } from "@/components/field";
import { TeamUrlInput } from "@/components/team-url-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  suggestUrl,
  TEAM_URL_MAX_LENGTH,
  TEAM_URL_PATTERN,
} from "@/lib/team-url";

// The same limits as the API's
export const teamSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a team name.")
    .max(100, "Use at most 100 characters."),
  url: z
    .string()
    .min(3, "Use at least 3 characters.")
    .max(TEAM_URL_MAX_LENGTH, `Use at most ${TEAM_URL_MAX_LENGTH} characters.`)
    .regex(
      TEAM_URL_PATTERN,
      "Use lowercase letters, numbers and single hyphens.",
    ),
});

type Values = z.infer<typeof teamSchema>;

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
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(teamSchema),
    defaultValues: { name: "", url: "" },
  });

  async function submit(values: Values) {
    try {
      const { data, error } = await createTeam({ body: values });
      if (data !== undefined) {
        await queryClient.invalidateQueries({ queryKey: myTeamsQueryKey() });
        onCreated(data);
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
    setError("root", { message: "Couldn’t create the team. Try again." });
  }

  const name = register("name", {
    onChange: () => {
      if (!urlEdited) {
        setValue("url", suggestUrl(getValues("name")));
      }
    },
  });
  const url = register("url", { onChange: () => setUrlEdited(true) });

  return (
    <form
      method="post"
      noValidate
      onSubmit={handleSubmit(submit)}
      className="flex flex-col gap-4"
    >
      <Field
        label="Team name"
        htmlFor={`${id}-team-name`}
        error={errors.name?.message}
      >
        <Input
          id={`${id}-team-name`}
          placeholder="Acme"
          autoComplete="organization"
          aria-invalid={errors.name !== undefined}
          {...name}
        />
      </Field>
      <Field
        label="Team URL"
        htmlFor={`${id}-team-url`}
        error={errors.url?.message}
      >
        <TeamUrlInput
          id={`${id}-team-url`}
          placeholder="acme"
          aria-invalid={errors.url !== undefined}
          {...url}
        />
      </Field>
      {errors.root ? (
        <p role="alert" className="text-error text-sm">
          {errors.root.message}
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
