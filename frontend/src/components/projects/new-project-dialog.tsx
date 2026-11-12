"use client";

import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { teamProjectsQueryKey } from "@/api/@tanstack/react-query.gen";
import { createProject } from "@/api/sdk.gen";
import type { Team } from "@/api/types.gen";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Creates a project in the team. Its URL is made from its name. */
export function NewProjectDialog({
  team,
  open,
  onOpenChange,
}: {
  team: Team;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  function close(next: boolean) {
    if (!next) {
      setName("");
      setError(undefined);
    }
    onOpenChange(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === "") {
      setError("Enter a name.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: failed } = await createProject({
        path: { team_url: team.url },
        body: { name: name.trim() },
      });
      if (data !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: teamProjectsQueryKey({ path: { team_url: team.url } }),
        });
        close(false);
        return;
      }
      if (failed?.detail === "name_taken") {
        setError(`${team.name} already has a project with this name.`);
        return;
      }
      if (Array.isArray(failed?.detail)) {
        setError(
          "Use a name with a letter or a digit, of at most 100 characters.",
        );
        return;
      }
      setError("Couldn’t create the project. Try again.");
    } catch {
      setError("Couldn’t create the project. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <form
          method="post"
          noValidate
          onSubmit={(event) => void submit(event)}
          className="flex flex-col gap-5"
        >
          <Field label="Name" htmlFor={`${id}-name`} error={error}>
            <Input
              id={`${id}-name`}
              placeholder="Pricing page"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(undefined);
              }}
              aria-invalid={error !== undefined}
            />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
